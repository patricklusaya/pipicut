import { dissolveOverlap } from './exportGraph.ts'
import { fadeOpacity } from './transform.ts'

export interface LayerClip {
  id: string
  type: 'image' | 'video'
  startTime: number
  duration: number
  fadeIn: number
  fadeOut: number
}

export interface StillLayer<T extends LayerClip> {
  clip: T
  alpha: number
  progress: number
}

export function pictureMoves(zoomDepth: number, crossfade: number, effect: string): boolean {
  return zoomDepth > 0.001 || crossfade > 0.02 || effect === 'snow' || effect === 'grain'
}

export interface ExportSample {
  time: number
  duration: number
}

/**
 * Frames the encoder actually needs. A still picture is one frame.
 * Slow zoom uses the project frame rate so the move does not step.
 * A dissolve uses that same rate, and only at the cut.
 * Snow and grain keep a lower rate.
 */
export function exportSamples(
  clips: readonly { startTime: number; duration: number }[],
  limit: number,
  options: { zoom: boolean; crossfade: number; animated: boolean; frameRate?: number },
): ExportSample[] {
  if (limit < 0.04) return []
  if (options.animated) return stepped(0, limit, 1 / 12)
  const step = 1 / (options.frameRate === 24 ? 24 : 30)
  const samples: ExportSample[] = []
  for (const span of stillSpans(clips, limit)) {
    let covered = span.start
    const fade = fadeAt(span.start, clips, options.crossfade)
    if (fade > 0.02) {
      const blend = stepped(span.start, Math.min(span.end, span.start + fade), step)
      samples.push(...blend)
      const last = blend[blend.length - 1]
      if (last) covered = last.time + last.duration
    }
    if (span.end - covered < 0.04) continue
    if (options.zoom) samples.push(...stepped(covered, span.end, step))
    else samples.push({ time: covered, duration: span.end - covered })
  }
  return samples
}

function fadeAt(
  start: number,
  clips: readonly { startTime: number; duration: number }[],
  crossfade: number,
): number {
  if (crossfade <= 0.02 || start <= 0.05) return 0
  let previous: { startTime: number; duration: number } | null = null
  let current: { startTime: number; duration: number } | null = null
  for (const clip of clips) {
    if (clip.startTime < start - 0.03 && (!previous || clip.startTime >= previous.startTime)) previous = clip
    if (Math.abs(clip.startTime - start) <= 0.03 && (!current || clip.duration >= current.duration)) current = clip
  }
  if (!previous || !current) return 0
  return Math.min(Math.max(0, crossfade), previous.duration / 2, current.duration / 2)
}

function stepped(start: number, end: number, step: number): ExportSample[] {
  const samples: ExportSample[] = []
  let cursor = start
  while (cursor < end - 0.02) {
    const duration = Math.min(step, end - cursor)
    if (duration < 0.02) break
    samples.push({ time: cursor, duration })
    cursor += duration
  }
  return samples
}

/** Contiguous slices of the voiceover, including the gaps between pictures. */
export function stillSpans(
  clips: readonly { startTime: number; duration: number }[],
  limit: number,
): { start: number; end: number }[] {
  const marks = [0, limit]
  for (const clip of clips) {
    marks.push(Math.max(0, Math.min(limit, clip.startTime)))
    marks.push(Math.max(0, Math.min(limit, clip.startTime + clip.duration)))
  }
  marks.sort((left, right) => left - right)
  const spans: { start: number; end: number }[] = []
  for (let index = 0; index < marks.length - 1; index += 1) {
    const start = marks[index] ?? 0
    const end = marks[index + 1] ?? start
    if (end - start >= 0.04) spans.push({ start, end })
  }
  return spans
}

/** Pictures visible at one moment, matching the preview dissolve. */
export function stillLayers<T extends LayerClip>(
  clips: readonly T[],
  time: number,
  crossfade: number,
): StillLayer<T>[] {
  const ordered = [...clips].sort((a, b) => a.startTime - b.startTime)
  let index = -1
  for (let cursor = 0; cursor < ordered.length; cursor += 1) {
    const clip = ordered[cursor]
    if (!clip) continue
    const end = clip.startTime + clip.duration
    if (time >= clip.startTime && time < end && (index < 0 || clip.startTime >= (ordered[index]?.startTime ?? 0))) {
      index = cursor
    }
  }
  const clip = index >= 0 ? ordered[index] : undefined
  if (!clip || clip.type !== 'image') return []
  const local = time - clip.startTime
  const progress = clip.duration > 0 ? Math.min(1, Math.max(0, local / clip.duration)) : 0
  const previous = index > 0 ? ordered[index - 1] : undefined
  const overlap =
    previous?.type === 'image' ? dissolveOverlap(previous.duration, clip.duration, crossfade) : 0
  if (previous && overlap > 0.02 && local >= 0 && local < overlap) {
    return [
      { clip: previous, alpha: 1, progress: 1 },
      { clip, alpha: Math.min(1, Math.max(0, local / overlap)), progress },
    ]
  }
  return [
    {
      clip,
      alpha: fadeOpacity(time, clip.startTime, clip.duration, clip.fadeIn, clip.fadeOut),
      progress,
    },
  ]
}
