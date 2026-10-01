import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny'
import type { VisualEffect } from './effects.ts'
import { exportSamples, pictureMoves } from './stillLayers.ts'
import { openStillPainter } from './stillRender.ts'
import { outputSize } from './transform.ts'
import type { AspectRatio, AudioAsset, Clip, ExportQuality, ZoomDirection } from '../types/project.ts'
import type { RenderProgress } from './render.ts'

export async function renderStillNative(
  input: {
    audio: AudioAsset | null
    voiceoverVolume: number
    aspect: AspectRatio
    quality: ExportQuality
    zoomDepth: number
    zoomDirection: ZoomDirection
    crossfade: number
    effect: VisualEffect
    fps: 24 | 30
    signal: AbortSignal
    onProgress: (progress: RenderProgress) => void
  },
  clips: Clip[],
  limit: number,
): Promise<Blob | null> {
  if (typeof VideoEncoder === 'undefined') return null
  const frame = await supportedFrame(input.aspect, input.quality)
  if (!frame) return null
  const sampleRate = input.audio ? await supportedAacRate() : null
  if (input.audio && !sampleRate) return null

  const painter = openStillPainter(clips, frame.width, frame.height, input)
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: false }),
    target,
  })
  const moving = pictureMoves(input.zoomDepth, input.crossfade, input.effect)
  const video = new CanvasSource(painter.canvas, {
    codec: 'avc',
    quality: new Quality(input.quality === 'draft' || frame.shrunk ? 'low' : 'medium'),
    keyFrameInterval: moving ? 2 : 10,
  })
  output.addVideoTrack(video)
  const voice = input.audio
    ? new AudioBufferSource({
        codec: 'aac',
        quality: new Quality({ bitrate: 128_000 }),
      })
    : null
  if (voice) output.addAudioTrack(voice)

  try {
    await output.start()
    await writeSamples(input, clips, limit, painter, video)
    if (voice && input.audio && sampleRate) {
      input.onProgress({
        progress: 0.96,
        renderedSeconds: limit,
        totalSeconds: limit,
        message: 'Adding the voiceover…',
      })
      await writeVoice(voice, input.audio, input.voiceoverVolume, limit, sampleRate, input.signal)
    }
    if (input.signal.aborted) throw new Error('Export cancelled.')
    await output.finalize()
    const buffer = target.buffer
    if (!buffer) throw new Error('The video could not be rendered on this device. Nothing was uploaded.')
    return new Blob([buffer], { type: 'video/mp4' })
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => undefined)
    }
    if (input.signal.aborted) throw new Error('Export cancelled.', { cause: error })
    throw error
  } finally {
    painter.close()
  }
}

async function supportedFrame(
  aspect: AspectRatio,
  quality: ExportQuality,
): Promise<{ width: number; height: number; shrunk: boolean } | null> {
  const preferred = outputSize(aspect, quality)
  try {
    if (await canEncodeVideo('avc', { width: preferred.width, height: preferred.height, frameRate: 4 })) {
      return { ...preferred, shrunk: false }
    }
    const smaller = outputSize(aspect, 'draft')
    if (
      (smaller.width !== preferred.width || smaller.height !== preferred.height) &&
      (await canEncodeVideo('avc', { width: smaller.width, height: smaller.height, frameRate: 4 }))
    ) {
      return { ...smaller, shrunk: true }
    }
  } catch {
    return null
  }
  return null
}

async function supportedAacRate(): Promise<number | null> {
  try {
    for (const sampleRate of [48_000, 44_100]) {
      if (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate })) return sampleRate
    }
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder')
    registerAacEncoder()
    for (const sampleRate of [48_000, 44_100]) {
      if (await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate })) return sampleRate
    }
  } catch {
    return null
  }
  return null
}

async function writeSamples(
  input: {
    signal: AbortSignal
    onProgress: (progress: RenderProgress) => void
    zoomDepth: number
    crossfade: number
    effect: VisualEffect
    fps: 24 | 30
  },
  clips: Clip[],
  limit: number,
  painter: { paint: (time: number, frameIndex: number) => Promise<void> },
  video: CanvasSource,
): Promise<void> {
  const samples = exportSamples(clips, limit, {
    zoom: input.zoomDepth > 0.001,
    crossfade: input.crossfade,
    animated: input.effect === 'snow' || input.effect === 'grain',
    frameRate: input.fps,
  })
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!sample) continue
    if (input.signal.aborted) throw new Error('Export cancelled.')
    const at = Math.min(limit - 0.001, sample.time + sample.duration / 2)
    await painter.paint(Math.max(0, at), index)
    await video.add(sample.time, sample.duration, { keyFrame: index === 0 || sample.duration >= 0.5 })
    if (index % 12 === 11) await nextTick()
    report(input.onProgress, Math.min(limit, sample.time + sample.duration), limit)
  }
}

async function writeVoice(
  voice: AudioBufferSource,
  audio: AudioAsset,
  volume: number,
  limit: number,
  sampleRate: number,
  signal: AbortSignal,
): Promise<void> {
  const decoded = await decodeVoice(audio.file)
  const sourceTotal = Math.min(decoded.length, Math.floor(Math.min(limit, decoded.duration) * decoded.sampleRate))
  if (sourceTotal < 1) return
  const outTotal = Math.max(1, Math.round((sourceTotal / decoded.sampleRate) * sampleRate))
  const left = decoded.getChannelData(0)
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left
  const ratio = decoded.sampleRate / sampleRate
  const context = new OfflineAudioContext(2, sampleRate, sampleRate)
  const gain = Math.max(0, volume)
  for (let start = 0; start < outTotal; start += sampleRate) {
    if (signal.aborted) throw new Error('Export cancelled.')
    const count = Math.min(sampleRate, outTotal - start)
    const buffer = context.createBuffer(2, count, sampleRate)
    const destLeft = buffer.getChannelData(0)
    const destRight = buffer.getChannelData(1)
    for (let index = 0; index < count; index += 1) {
      const source = (start + index) * ratio
      destLeft[index] = sampleAt(left, source) * gain
      destRight[index] = sampleAt(right, source) * gain
    }
    await voice.add(buffer)
  }
}

async function decodeVoice(file: Blob): Promise<AudioBuffer> {
  const context = new AudioContext()
  try {
    const bytes = await file.arrayBuffer()
    return await context.decodeAudioData(bytes.slice(0))
  } catch {
    throw new Error('This voiceover could not be read. Use an MP3 or WAV file.')
  } finally {
    await context.close()
  }
}

function sampleAt(channel: Float32Array, position: number): number {
  const index = Math.floor(position)
  const next = channel[index + 1] ?? channel[index] ?? 0
  const current = channel[index] ?? 0
  return current + (next - current) * (position - index)
}

function report(onProgress: (progress: RenderProgress) => void, renderedSeconds: number, total: number): void {
  onProgress({
    progress: Math.max(0, Math.min(0.95, renderedSeconds / total)),
    renderedSeconds,
    totalSeconds: total,
    message: 'Rendering video…',
  })
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
