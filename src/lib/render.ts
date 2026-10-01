import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { buildFilterGraph, dissolveOverlap, encodeFrameRate, zoomFrameSize, type GraphClip } from '@/lib/exportGraph.ts'
import { renderStillTimeline } from '@/lib/stillRender.ts'
import { renderStillNative } from '@/lib/nativeStill.ts'
import { frameRect, outputSize } from '@/lib/transform.ts'
import type { VisualEffect } from '@/lib/effects.ts'
import type { AspectRatio, ExportQuality, ZoomDirection } from '@/types/project.ts'
import { fileExtension } from '@/lib/media.ts'
import { exportSpan } from '@/lib/timeline.ts'
import type { AudioAsset, Clip } from '@/types/project.ts'

export interface RenderProgress {
  progress: number
  renderedSeconds: number
  totalSeconds: number
  message: string
}

let ffmpeg: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

async function loadEncoder(onProgress: (progress: RenderProgress) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg
  if (!loading) {
    loading = (async () => {
      const instance = new FFmpeg()
      await instance.load({
        coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
      })
      ffmpeg = instance
      return instance
    })().catch((error: unknown) => {
      loading = null
      ffmpeg = null
      throw error
    })
  }
  onProgress({ progress: 0, renderedSeconds: 0, totalSeconds: 0, message: 'Starting the local encoder…' })
  return loading
}

export function resetEncoder(): void {
  try {
    ffmpeg?.terminate()
  } catch {
    // The worker is already gone.
  }
  ffmpeg = null
  loading = null
}

async function hasAudioStream(instance: FFmpeg, filename: string): Promise<boolean> {
  let log = ''
  const onLog = ({ message }: { message: string }) => {
    log += `${message}\n`
  }
  instance.on('log', onLog)
  try {
    await instance.exec(['-hide_banner', '-i', filename])
  } finally {
    instance.off('log', onLog)
  }
  return /Stream #\d+:\d+(?:\[[^\]]+\])?\(?\w*\)?: Audio:/i.test(log) || /\bAudio:/i.test(log)
}

function friendlyError(log: string): string {
  if (/out of memory|memory access|OOM|Aborted/i.test(log)) {
    return 'The browser ran out of memory while rendering. Choose Fast quality, or close other tabs and try again.'
  }
  if (/invalid data|decoder|not supported|invalid argument|unknown encoder/i.test(log)) {
    return 'This video could not be processed. Try MP4 (H.264) or another browser-compatible video file.'
  }
  return 'The video could not be rendered on this device. Nothing was uploaded.'
}

function asBlob(data: Uint8Array | string): Blob {
  if (typeof data === 'string') return new Blob([data], { type: 'video/mp4' })
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return new Blob([copy], { type: 'video/mp4' })
}

const CHUNK_SECONDS = 90

interface ExportClip extends Clip {
  zoomOrigin: number
  zoomSpan: number
  still: Blob | null
}

export async function renderTimeline(input: {
  audio: AudioAsset | null
  clips: Clip[]
  voiceoverVolume: number
  videoMix: number
  duration: number
  aspect: AspectRatio
  fps: 24 | 30
  quality: ExportQuality
  zoomDepth: number
  zoomDirection: ZoomDirection
  crossfade: number
  effect: VisualEffect
  signal: AbortSignal
  onProgress: (progress: RenderProgress) => void
}): Promise<Blob> {
  const limit = exportSpan(input.audio?.duration ?? null, input.duration)
  if (limit < 0.1) {
    throw new Error('Add a voiceover or a visual before exporting.')
  }
  const clips = clipsForExport(input.clips, limit)
  const skipped = input.clips.length - clips.length
  const imagesOnly = clips.every((clip) => clip.type === 'image')
  if (imagesOnly && limit > 45 * 60) {
    throw new Error(
      `This export is ${Math.round(limit / 60)} minutes long. Add the voiceover so the file matches it, or use photo names that start inside the voiceover.`,
    )
  }
  if (imagesOnly) {
    const native = await renderStillNative(input, clips, limit)
    if (native) {
      input.onProgress({ progress: 1, renderedSeconds: limit, totalSeconds: limit, message: 'Ready' })
      return native
    }
  }
  const instance = await loadEncoder(input.onProgress)
  if (input.signal.aborted) throw new Error('Export cancelled.')

  if (imagesOnly) {
    const movie = await renderStillTimeline(instance, input, clips, limit)
    input.onProgress({ progress: 1, renderedSeconds: limit, totalSeconds: limit, message: 'Ready' })
    return asBlob(movie)
  }

  const frame = outputSize(input.aspect, input.quality)
  const canvasSize = zoomFrameSize(frame.width, frame.height, input.zoomDepth)
  input.onProgress({
    progress: 0.02,
    renderedSeconds: 0,
    totalSeconds: limit,
    message: skipped > 0 ? 'Preparing photos inside the voiceover…' : 'Preparing media…',
  })

  const ready: ExportClip[] = []
  for (const clip of clips) {
    if (input.signal.aborted) throw new Error('Export cancelled.')
    ready.push({
      ...clip,
      zoomOrigin: 0,
      zoomSpan: clip.duration,
      still: clip.type === 'image' ? await prepareStill(clip, canvasSize.width, canvasSize.height) : null,
    })
  }

  const pieces: Uint8Array[] = []
  for (let start = 0; start < limit; start += CHUNK_SECONDS) {
    const end = Math.min(limit, start + CHUNK_SECONDS)
    const piece = await renderPiece(instance, input, ready, start, end, limit)
    pieces.push(piece)
    if (pieces.length >= 4) {
      const packed = await concatPieces(instance, pieces, input.signal)
      pieces.splice(0, pieces.length, packed)
    }
  }
  const movie = pieces.length === 1 ? pieces[0] : await concatPieces(instance, pieces, input.signal)
  if (!movie) throw new Error('The video could not be rendered on this device. Nothing was uploaded.')
  input.onProgress({ progress: 1, renderedSeconds: limit, totalSeconds: limit, message: 'Ready' })
  return asBlob(movie)
}

function clipsForExport(clips: Clip[], limit: number): Clip[] {
  return clips.flatMap((clip) => {
    if (clip.startTime >= limit - 0.04) return []
    const duration = Math.min(clip.duration, Math.max(0.1, limit - clip.startTime))
    if (duration < 0.1) return []
    return [{ ...clip, duration }]
  })
}

function sliceChunk(clips: ExportClip[], start: number, end: number): ExportClip[] {
  return clips.flatMap((clip) => {
    const clipEnd = clip.startTime + clip.duration
    const visibleStart = Math.max(clip.startTime, start)
    const visibleEnd = Math.min(clipEnd, end)
    const duration = visibleEnd - visibleStart
    if (duration < 0.08) return []
    return [
      {
        ...clip,
        startTime: visibleStart - start,
        duration,
        zoomOrigin: clip.zoomOrigin + (visibleStart - clip.startTime),
        zoomSpan: clip.zoomSpan,
      },
    ]
  })
}

async function prepareStill(clip: Clip, width: number, height: number): Promise<Blob> {
  const bitmap = await createImageBitmap(clip.file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Could not prepare an image for export.')
    context.fillStyle = '#000'
    context.fillRect(0, 0, width, height)
    const rect = frameRect(
      bitmap.width,
      bitmap.height,
      clip.fit,
      clip.scale,
      clip.positionX,
      clip.positionY,
      width,
      height,
    )
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
    if (!blob) throw new Error('Could not prepare an image for export.')
    return blob
  } finally {
    bitmap.close()
  }
}

async function renderPiece(
  instance: FFmpeg,
  input: {
    audio: AudioAsset | null
    voiceoverVolume: number
    videoMix: number
    fps: 24 | 30
    quality: ExportQuality
    aspect: AspectRatio
    zoomDepth: number
    zoomDirection: ZoomDirection
    crossfade: number
    effect: VisualEffect
    signal: AbortSignal
    onProgress: (progress: RenderProgress) => void
  },
  clips: ExportClip[],
  start: number,
  end: number,
  total: number,
): Promise<Uint8Array> {
  const pieceClips = sliceChunk(clips, start, end)
  const duration = Math.max(0.1, end - start)
  const written: string[] = []
  const write = async (name: string, file: Blob | Uint8Array) => {
    await instance.writeFile(name, file instanceof Uint8Array ? file : await fetchFile(file))
    written.push(name)
  }
  let log = ''
  const onLog = ({ message }: { message: string }) => {
    log += `${message}\n`
    const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
    if (!match) return
    const local = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
    const renderedSeconds = Math.min(total, start + local)
    input.onProgress({
      progress: Math.max(0, Math.min(0.99, renderedSeconds / total)),
      renderedSeconds,
      totalSeconds: total,
      message: 'Rendering video…',
    })
  }

  try {
    const graphClips: GraphClip[] = []
    for (let index = 0; index < pieceClips.length; index += 1) {
      const clip = pieceClips[index]
      const filename = clip.still ? `clip${index}.jpg` : `clip${index}.${fileExtension(clip.name, 'mp4')}`
      await write(filename, clip.still ?? clip.file)
      let hasAudio = false
      if (clip.type === 'video' && !clip.muted && !clip.still) {
        hasAudio = await hasAudioStream(instance, filename)
      }
      graphClips.push({
        type: clip.type,
        start: clip.startTime,
        duration: clip.duration,
        trimStart: clip.still ? 0 : clip.trimStart,
        sourceDuration: clip.still ? null : clip.sourceDuration,
        width: clip.width,
        height: clip.height,
        scale: clip.still ? 1 : clip.scale,
        positionX: clip.still ? 0 : clip.positionX,
        positionY: clip.still ? 0 : clip.positionY,
        fit: clip.fit,
        volume: clip.volume,
        muted: clip.muted,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        hasAudio,
        prepared: Boolean(clip.still),
        zoomOrigin: clip.zoomOrigin,
        zoomSpan: clip.zoomSpan,
      })
    }

    const output = outputSize(input.aspect, input.quality)
    const hasVideo = pieceClips.some((clip) => clip.type === 'video')
    const fps = encodeFrameRate({
      fps: input.fps,
      hasVideo,
      zoomDepth: input.zoomDepth,
      crossfade: input.crossfade,
      effect: input.effect,
    })
    const graph = buildFilterGraph(graphClips, duration, input.voiceoverVolume, input.videoMix, {
      width: output.width,
      height: output.height,
      fps,
      zoomDepth: input.zoomDepth,
      zoomDirection: input.zoomDirection,
      crossfade: input.crossfade,
      effect: input.effect,
    })
    const args: string[] = []
    if (input.audio) {
      const extension = fileExtension(input.audio.name, 'mp3')
      await write(`voice.${extension}`, input.audio.file)
      args.push('-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', `voice.${extension}`)
    } else {
      args.push(
        '-f',
        'lavfi',
        '-t',
        duration.toFixed(3),
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=48000',
      )
    }
    pieceClips.forEach((clip, index) => {
      if (clip.still) {
        const next = pieceClips[index + 1]
        const hold = clip.duration + dissolveOverlap(clip.duration, next?.duration ?? null, input.crossfade)
        args.push('-loop', '1', '-framerate', String(fps), '-t', hold.toFixed(3), '-i', `clip${index}.jpg`)
        return
      }
      args.push('-i', `clip${index}.${fileExtension(clip.name, 'mp4')}`)
    })
    args.push(
      '-filter_complex',
      graph,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-t',
      duration.toFixed(3),
      '-r',
      String(fps),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      ...(hasVideo ? [] : ['-tune', 'stillimage']),
      '-crf',
      input.quality === 'draft' ? '28' : '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      'out.mp4',
    )

    instance.on('log', onLog)
    const code = await instance.exec(args, undefined, { signal: input.signal })
    if (input.signal.aborted) throw new Error('Export cancelled.')
    if (code !== 0) throw new Error(friendlyError(log))
    const data = await instance.readFile('out.mp4')
    return copyBytes(data)
  } catch (error) {
    if (input.signal.aborted) throw new Error('Export cancelled.', { cause: error })
    if (error instanceof Error && /cancelled/i.test(error.message)) throw error
    const message =
      error instanceof Error && /could not|memory|Export cancelled/i.test(error.message)
        ? error.message
        : friendlyError(log)
    throw new Error(message, { cause: error })
  } finally {
    instance.off('log', onLog)
    for (const name of [...written, 'out.mp4', 'probe.txt']) {
      try {
        await instance.deleteFile(name)
      } catch {
        // Missing temp files are fine.
      }
    }
  }
}

async function concatPieces(
  instance: FFmpeg,
  pieces: Uint8Array[],
  signal: AbortSignal,
): Promise<Uint8Array> {
  const first = pieces[0]
  if (!first || pieces.length === 1) return first ?? new Uint8Array()
  const names = pieces.map((_, index) => `part${index}.mp4`)
  try {
    const list = names.map((name) => `file '${name}'`).join('\n')
    for (let index = 0; index < pieces.length; index += 1) {
      const bytes = pieces[index]
      if (bytes) await instance.writeFile(names[index] ?? `part${index}.mp4`, bytes)
    }
    await instance.writeFile('list.txt', new TextEncoder().encode(list))
    const code = await instance.exec(
      ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'joined.mp4'],
      undefined,
      { signal },
    )
    if (signal.aborted) throw new Error('Export cancelled.')
    if (code !== 0) throw new Error('The video could not be joined on this device. Nothing was uploaded.')
    return copyBytes(await instance.readFile('joined.mp4'))
  } finally {
    for (const name of [...names, 'list.txt', 'joined.mp4']) {
      try {
        await instance.deleteFile(name)
      } catch {
        // Missing temp files are fine.
      }
    }
  }
}

function copyBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  return new Uint8Array(data)
}
