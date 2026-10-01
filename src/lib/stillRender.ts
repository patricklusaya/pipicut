import type { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import { previewGrade, type VisualEffect } from './effects.ts'
import { fileExtension } from './media.ts'
import { pictureMoves, stillLayers } from './stillLayers.ts'
import { frameRect, kenBurnsScale, outputSize } from './transform.ts'
import type { AspectRatio, AudioAsset, Clip, ExportQuality, ZoomDirection } from '../types/project.ts'

interface RenderProgress {
  progress: number
  renderedSeconds: number
  totalSeconds: number
  message: string
}

export function openStillPainter(
  clips: Clip[],
  width: number,
  height: number,
  look: { zoomDepth: number; zoomDirection: ZoomDirection; crossfade: number; effect: VisualEffect },
): {
  canvas: HTMLCanvasElement
  paint: (time: number, frameIndex: number) => Promise<void>
  close: () => void
} {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not prepare an image for export.')
  context.imageSmoothingQuality = 'high'
  const bitmaps = new BitmapCache(width, height, look.zoomDepth)
  return {
    canvas,
    paint: (time, frameIndex) => paintMoment(context, bitmaps, clips, time, frameIndex, width, height, look),
    close: () => bitmaps.close(),
  }
}

const MOTION_FPS = 8
const BATCH_SECONDS = 4
const HOLD_SECONDS = 20

export async function renderStillTimeline(
  instance: FFmpeg,
  input: {
    audio: AudioAsset | null
    voiceoverVolume: number
    aspect: AspectRatio
    quality: ExportQuality
    zoomDepth: number
    zoomDirection: ZoomDirection
    crossfade: number
    effect: VisualEffect
    signal: AbortSignal
    onProgress: (progress: RenderProgress) => void
  },
  clips: Clip[],
  limit: number,
): Promise<Uint8Array> {
  const frame = outputSize(input.aspect, input.quality)
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('Could not prepare an image for export.')
  context.imageSmoothingQuality = 'high'
  const bitmaps = new BitmapCache(frame.width, frame.height, input.zoomDepth)
  const jpegQuality = input.quality === 'draft' ? 0.72 : 0.86
  const paint = (time: number, frameIndex: number) =>
    paintMoment(context, bitmaps, clips, time, frameIndex, frame.width, frame.height, input)

  try {
    const moving = pictureMoves(input.zoomDepth, input.crossfade, input.effect)
    const silent = moving
      ? await renderMotion(instance, input, limit, paint, canvas, jpegQuality)
      : await renderSlides(instance, input, clips, limit, paint, canvas, jpegQuality)
    input.onProgress({
      progress: 0.98,
      renderedSeconds: limit,
      totalSeconds: limit,
      message: 'Adding the voiceover…',
    })
    return await muxVoice(instance, silent, input.audio, input.voiceoverVolume, limit, input.signal)
  } finally {
    bitmaps.close()
  }
}

async function renderSlides(
  instance: FFmpeg,
  input: { quality: ExportQuality; signal: AbortSignal; onProgress: (progress: RenderProgress) => void },
  clips: Clip[],
  limit: number,
  paint: (time: number, frameIndex: number) => Promise<void>,
  canvas: HTMLCanvasElement,
  jpegQuality: number,
): Promise<Uint8Array> {
  const boundaries = [0, limit]
  for (const clip of clips) {
    boundaries.push(Math.max(0, clip.startTime), Math.min(limit, clip.startTime + clip.duration))
  }
  boundaries.sort((a, b) => a - b)
  const pieces: Uint8Array[] = []
  let rendered = 0
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index] ?? 0
    const end = boundaries[index + 1] ?? limit
    let remaining = end - start
    if (remaining < 0.08) continue
    if (input.signal.aborted) throw new Error('Export cancelled.')
    await paint(Math.min(limit - 0.001, start + 0.001), index)
    const blob = await canvasJpeg(canvas, jpegQuality)
    while (remaining > 0.05) {
      const slice = Math.min(HOLD_SECONDS, remaining)
      const piece = await encodeHold(instance, blob, slice, input.quality, input.signal, (local) => {
        report(input.onProgress, Math.min(limit, rendered + local), limit)
      })
      pieces.push(piece)
      remaining -= slice
      rendered += slice
      await packPieces(instance, pieces, input.signal)
    }
  }
  return finishPieces(instance, pieces, input.signal)
}

async function renderMotion(
  instance: FFmpeg,
  input: { quality: ExportQuality; signal: AbortSignal; onProgress: (progress: RenderProgress) => void },
  limit: number,
  paint: (time: number, frameIndex: number) => Promise<void>,
  canvas: HTMLCanvasElement,
  jpegQuality: number,
): Promise<Uint8Array> {
  const frameCount = Math.max(1, Math.round(limit * MOTION_FPS))
  const batchSize = MOTION_FPS * BATCH_SECONDS
  const pieces: Uint8Array[] = []
  let batch: Blob[] = []
  const flush = async (renderedFrames: number) => {
    if (batch.length === 0) return
    const frames = batch
    batch = []
    const piece = await encodeFrames(instance, frames, MOTION_FPS, input.quality, input.signal, (local) => {
      const done = Math.max(0, renderedFrames - frames.length) / MOTION_FPS + local
      report(input.onProgress, Math.min(limit, done), limit)
    })
    pieces.push(piece)
    await packPieces(instance, pieces, input.signal)
  }
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (input.signal.aborted) throw new Error('Export cancelled.')
    const time = Math.min(limit - 0.001, frame / MOTION_FPS)
    await paint(time, frame)
    batch.push(await canvasJpeg(canvas, jpegQuality))
    if (frame % 4 === 3) await nextTick()
    if (batch.length >= batchSize) await flush(frame + 1)
  }
  await flush(frameCount)
  return finishPieces(instance, pieces, input.signal)
}

async function paintMoment(
  context: CanvasRenderingContext2D,
  bitmaps: BitmapCache,
  clips: Clip[],
  time: number,
  frameIndex: number,
  width: number,
  height: number,
  input: { zoomDepth: number; zoomDirection: ZoomDirection; crossfade: number; effect: VisualEffect },
): Promise<void> {
  context.filter = 'none'
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  context.fillStyle = '#000'
  context.fillRect(0, 0, width, height)
  const layers = stillLayers(clips, time, input.crossfade)
  context.filter = previewGrade(input.effect) ?? 'none'
  const used = new Set<string>()
  for (const layer of layers) {
    if (layer.alpha <= 0.004) continue
    used.add(layer.clip.id)
    const bitmap = await bitmaps.get(layer.clip)
    const scale = kenBurnsScale(layer.progress, input.zoomDepth, input.zoomDirection, layer.clip.scale)
    const fit = input.zoomDepth > 0.001 || layer.clip.fit === 'fill' ? 'fill' : layer.clip.fit
    const rect = frameRect(
      bitmap.width,
      bitmap.height,
      fit,
      scale,
      layer.clip.positionX,
      layer.clip.positionY,
      width,
      height,
    )
    context.save()
    context.globalAlpha = layer.alpha
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
    context.restore()
  }
  bitmaps.retain(used)
  context.filter = 'none'
  context.globalAlpha = 1
  context.globalCompositeOperation = 'source-over'
  if (input.effect === 'vignette') drawVignette(context, width, height)
  if (input.effect === 'grain') drawGrain(context, width, height, frameIndex)
  if (input.effect === 'snow') drawSnow(context, width, height, frameIndex)
}

class BitmapCache {
  private readonly items = new Map<string, ImageBitmap>()
  private readonly width: number
  private readonly height: number
  private readonly zoomDepth: number

  constructor(width: number, height: number, zoomDepth: number) {
    this.width = width
    this.height = height
    this.zoomDepth = zoomDepth
  }

  async get(clip: Clip): Promise<ImageBitmap> {
    const cached = this.items.get(clip.id)
    if (cached) return cached
    const edge = Math.ceil(Math.max(this.width, this.height) * (1 + Math.max(0, this.zoomDepth)))
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(clip.file, { resizeWidth: edge, resizeQuality: 'high' })
    } catch {
      bitmap = await createImageBitmap(clip.file)
    }
    this.items.set(clip.id, bitmap)
    return bitmap
  }

  retain(ids: Set<string>): void {
    for (const [id, bitmap] of this.items) {
      if (ids.has(id)) continue
      bitmap.close()
      this.items.delete(id)
    }
  }

  close(): void {
    for (const bitmap of this.items.values()) bitmap.close()
    this.items.clear()
  }
}

function drawVignette(context: CanvasRenderingContext2D, width: number, height: number): void {
  const radius = Math.max(width, height) * 0.72
  const gradient = context.createRadialGradient(width / 2, height / 2, radius * 0.35, width / 2, height / 2, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.62)')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
}

function drawGrain(context: CanvasRenderingContext2D, width: number, height: number, frame: number): void {
  const tile = document.createElement('canvas')
  tile.width = 128
  tile.height = 72
  const tileContext = tile.getContext('2d')
  if (!tileContext) return
  const image = tileContext.createImageData(tile.width, tile.height)
  let seed = frame * 9973 + 1
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  for (let index = 0; index < image.data.length; index += 4) {
    const shade = 80 + next() * 175
    image.data[index] = shade
    image.data[index + 1] = shade
    image.data[index + 2] = shade
    image.data[index + 3] = next() > 0.55 ? 90 : 0
  }
  tileContext.putImageData(image, 0, 0)
  context.save()
  context.globalAlpha = 0.4
  context.globalCompositeOperation = 'overlay'
  context.drawImage(tile, 0, 0, width, height)
  context.restore()
}

function drawSnow(context: CanvasRenderingContext2D, width: number, height: number, frame: number): void {
  context.save()
  context.fillStyle = 'rgba(255,255,255,0.9)'
  for (let index = 0; index < 80; index += 1) {
    const speed = 0.15 + (index % 5) * 0.05
    const x = ((index * 47 + frame * (3 + (index % 4))) % 1000) / 1000
    const y = ((index * 29 + frame * speed * 40) % 1000) / 1000
    context.beginPath()
    context.arc(x * width, y * height, 1.2 + (index % 3), 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

async function canvasJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('Could not prepare an image for export.')
  return blob
}

function report(onProgress: (progress: RenderProgress) => void, renderedSeconds: number, total: number): void {
  onProgress({
    progress: Math.max(0, Math.min(0.97, renderedSeconds / total)),
    renderedSeconds,
    totalSeconds: total,
    message: 'Rendering video…',
  })
}

async function encodeHold(
  instance: FFmpeg,
  blob: Blob,
  duration: number,
  quality: ExportQuality,
  signal: AbortSignal,
  onTime: (seconds: number) => void,
): Promise<Uint8Array> {
  await instance.writeFile('hold.jpg', await fetchFile(blob))
  return execFile(
    instance,
    [
      '-loop',
      '1',
      '-framerate',
      '1',
      '-t',
      Math.max(0.1, duration).toFixed(3),
      '-i',
      'hold.jpg',
      ...encodeArgs(quality),
      'out.mp4',
    ],
    signal,
    ['hold.jpg'],
    onTime,
  )
}

async function encodeFrames(
  instance: FFmpeg,
  frames: Blob[],
  fps: number,
  quality: ExportQuality,
  signal: AbortSignal,
  onTime: (seconds: number) => void,
): Promise<Uint8Array> {
  const names: string[] = []
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index]
    if (!frame) continue
    const name = `f${String(index).padStart(4, '0')}.jpg`
    await instance.writeFile(name, await fetchFile(frame))
    names.push(name)
  }
  return execFile(
    instance,
    [
      '-framerate',
      String(fps),
      '-start_number',
      '0',
      '-i',
      'f%04d.jpg',
      '-frames:v',
      String(names.length),
      ...encodeArgs(quality),
      'out.mp4',
    ],
    signal,
    names,
    onTime,
  )
}

function encodeArgs(quality: ExportQuality): string[] {
  return [
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-tune',
    'stillimage',
    '-crf',
    quality === 'draft' ? '28' : '23',
    '-pix_fmt',
    'yuv420p',
    '-an',
  ]
}

async function packPieces(instance: FFmpeg, pieces: Uint8Array[], signal: AbortSignal): Promise<void> {
  if (pieces.length < 4) return
  const packed = await concatPieces(instance, pieces, signal)
  pieces.splice(0, pieces.length, packed)
}

async function finishPieces(instance: FFmpeg, pieces: Uint8Array[], signal: AbortSignal): Promise<Uint8Array> {
  const movie = pieces.length === 1 ? pieces[0] : await concatPieces(instance, pieces, signal)
  if (!movie || movie.byteLength === 0) {
    throw new Error('The video could not be rendered on this device. Nothing was uploaded.')
  }
  return movie
}

async function concatPieces(instance: FFmpeg, pieces: Uint8Array[], signal: AbortSignal): Promise<Uint8Array> {
  const first = pieces[0]
  if (!first || pieces.length === 1) return first ?? new Uint8Array()
  const names = pieces.map((_, index) => `part${index}.mp4`)
  const list = names.map((name) => `file '${name}'`).join('\n')
  for (let index = 0; index < pieces.length; index += 1) {
    const bytes = pieces[index]
    const name = names[index]
    if (bytes && name) await instance.writeFile(name, bytes)
  }
  await instance.writeFile('list.txt', new TextEncoder().encode(list))
  return execFile(
    instance,
    ['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4'],
    signal,
    [...names, 'list.txt'],
    undefined,
  )
}

async function muxVoice(
  instance: FFmpeg,
  video: Uint8Array,
  audio: AudioAsset | null,
  volume: number,
  duration: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  await instance.writeFile('film.mp4', video)
  const extra = ['film.mp4']
  const args = ['-i', 'film.mp4']
  if (audio) {
    const name = `voice.${fileExtension(audio.name, 'mp3')}`
    await instance.writeFile(name, await fetchFile(audio.file))
    extra.push(name)
    args.push('-t', duration.toFixed(3), '-i', name)
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
  args.push(
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-af',
    `volume=${Math.max(0, volume).toFixed(3)}`,
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-shortest',
    'out.mp4',
  )
  return execFile(instance, args, signal, extra, undefined)
}

async function execFile(
  instance: FFmpeg,
  args: string[],
  signal: AbortSignal,
  extra: string[],
  onTime: ((seconds: number) => void) | undefined,
): Promise<Uint8Array> {
  let log = ''
  const onLog = ({ message }: { message: string }) => {
    log += `${message}\n`
    const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(message)
    if (!match || !onTime) return
    onTime(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]))
  }
  instance.on('log', onLog)
  try {
    const code = await instance.exec(args, undefined, { signal })
    if (signal.aborted) throw new Error('Export cancelled.')
    if (code !== 0) throw new Error(friendlyError(log))
    return copyBytes(await instance.readFile('out.mp4'))
  } catch (error) {
    if (signal.aborted) throw new Error('Export cancelled.', { cause: error })
    if (error instanceof Error && /cancelled|could not|memory|voiceover/i.test(error.message)) throw error
    throw new Error(friendlyError(log), { cause: error })
  } finally {
    instance.off('log', onLog)
    for (const name of [...extra, 'out.mp4']) {
      try {
        await instance.deleteFile(name)
      } catch {
        // Missing temp files are fine.
      }
    }
  }
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

function copyBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === 'string') return new TextEncoder().encode(data)
  return new Uint8Array(data)
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
