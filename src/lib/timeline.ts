import type { Clip, Notice, UnassignedAsset } from '../types/project.ts'

export const MIN_CLIP_DURATION = 0.1
export const DEFAULT_TAIL = 5
export const MAX_CLIP_DURATION = 60 * 60 * 2

export function projectDuration(audioDuration: number | null, clips: Clip[]): number {
  let end = audioDuration ?? 0
  for (const clip of clips) end = Math.max(end, clip.startTime + clip.duration)
  return end
}

/** The file follows the voiceover. Pictures that start after it are left out. */
export function exportSpan(audioDuration: number | null, projectLength: number): number {
  if (audioDuration != null && audioDuration > 0.4) return audioDuration
  return projectLength
}

export function clipAtTime(clips: readonly Clip[], time: number): Clip | null {
  let found: Clip | null = null
  for (const clip of clips) {
    const end = clip.startTime + clip.duration
    if (time >= clip.startTime && time < end) {
      if (!found || clip.startTime >= found.startTime) found = clip
    }
  }
  if (found) return found
  for (const clip of clips) {
    const end = clip.startTime + clip.duration
    if (time + 0.001 >= end && time <= end + 0.001) {
      if (!found || clip.startTime >= found.startTime) found = clip
    }
  }
  return found
}

export function videoContentDuration(clip: Clip): number | null {
  if (clip.type !== 'video' || clip.sourceDuration == null) return null
  return Math.max(0, clip.sourceDuration - clip.trimStart)
}

export function videoSlotNote(clip: Clip): 'trimmed' | 'holds' | null {
  const content = videoContentDuration(clip)
  if (content == null) return null
  if (content + 0.05 < clip.duration) return 'holds'
  if (content - 0.05 > clip.duration) return 'trimmed'
  return null
}

export function assignDurations(clips: Clip[], audioDuration: number | null): Clip[] {
  const sorted = [...clips].sort(
    (a, b) => a.startTime - b.startTime || a.name.localeCompare(b.name),
  )
  return sorted.map((clip, index) => {
    if (!clip.auto) return clip
    let nextStart: number | null = null
    for (let i = index + 1; i < sorted.length; i += 1) {
      if (sorted[i].startTime > clip.startTime + 0.001) {
        nextStart = sorted[i].startTime
        break
      }
    }
    let end: number
    if (nextStart != null) end = nextStart
    else if (audioDuration != null) end = Math.max(clip.startTime + MIN_CLIP_DURATION, audioDuration)
    else if (clip.type === 'video' && clip.sourceDuration != null) {
      end = clip.startTime + Math.max(MIN_CLIP_DURATION, clip.sourceDuration - clip.trimStart)
    } else end = clip.startTime + DEFAULT_TAIL
    const duration = Math.min(
      MAX_CLIP_DURATION,
      Math.max(MIN_CLIP_DURATION, end - clip.startTime),
    )
    if (Math.abs(duration - clip.duration) < 0.0001) return clip
    return { ...clip, duration }
  })
}

export function deriveNotices(clips: Clip[], unassigned: UnassignedAsset[]): Notice[] {
  const notices: Notice[] = []
  for (const asset of unassigned) {
    notices.push({
      id: `unassigned-${asset.id}`,
      tone: 'warning',
      message: asset.reason,
      unassignedId: asset.id,
    })
  }

  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime || a.name.localeCompare(b.name))
  const groups = new Map<number, Clip[]>()
  for (const clip of sorted) {
    const key = Math.round(clip.startTime * 1000)
    const group = groups.get(key)
    if (group) group.push(clip)
    else groups.set(key, [clip])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    notices.push({
      id: `duplicate-${group.map((clip) => clip.id).join('-')}`,
      tone: 'warning',
      message: `${group[0]?.name ?? 'Two files'} was added twice. Remove the extra copy.`,
      clipId: group[1]?.id,
    })
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]
    for (let j = i + 1; j < sorted.length; j += 1) {
      const other = sorted[j]
      if (other.startTime >= current.startTime + current.duration - 0.05) break
      if (Math.abs(current.startTime - other.startTime) < 0.001) continue
      notices.push({
        id: `overlap-${current.id}-${other.id}`,
        tone: 'warning',
        message: `${current.name} overlaps ${other.name}.`,
        clipId: other.id,
      })
    }
  }

  for (const clip of clips) {
    if (videoSlotNote(clip) === 'trimmed') {
      notices.push({
        id: `trimmed-${clip.id}`,
        tone: 'info',
        message: `${clip.name} is longer than its slot, so the extra was trimmed.`,
        clipId: clip.id,
      })
    }
  }

  return notices
}

export function makeClip(input: {
  id: string
  type: Clip['type']
  name: string
  mimeType: string
  url: string
  thumbnailUrl: string | null
  file: Blob
  startTime: number
  sourceDuration: number | null
  width: number
  height: number
}): Clip {
  return {
    id: input.id,
    type: input.type,
    name: input.name,
    mimeType: input.mimeType,
    url: input.url,
    thumbnailUrl: input.thumbnailUrl,
    file: input.file,
    startTime: Math.max(0, input.startTime),
    duration: MIN_CLIP_DURATION,
    trimStart: 0,
    sourceDuration: input.sourceDuration,
    width: input.width,
    height: input.height,
    scale: 1,
    positionX: 0,
    positionY: 0,
    fit: 'fit',
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    auto: true,
  }
}

export function withStart(clip: Clip, startTime: number): Clip {
  return { ...clip, startTime: Math.max(0, startTime), auto: false }
}

export function withTrim(clip: Clip, edge: 'start' | 'end', time: number): Clip {
  if (edge === 'end') {
    const duration = Math.min(
      MAX_CLIP_DURATION,
      Math.max(MIN_CLIP_DURATION, time - clip.startTime),
    )
    return { ...clip, duration, auto: false }
  }

  let nextStart = Math.max(0, time)
  let trimStart = clip.trimStart
  let duration = clip.duration - (nextStart - clip.startTime)
  if (clip.type === 'video') {
    trimStart += nextStart - clip.startTime
    if (trimStart < 0) {
      nextStart -= trimStart
      duration += trimStart
      trimStart = 0
    }
    if (clip.sourceDuration != null && trimStart > clip.sourceDuration - MIN_CLIP_DURATION) {
      const maxTrim = Math.max(0, clip.sourceDuration - MIN_CLIP_DURATION)
      nextStart -= trimStart - maxTrim
      duration += trimStart - maxTrim
      trimStart = maxTrim
    }
  }
  if (duration < MIN_CLIP_DURATION) {
    const fix = MIN_CLIP_DURATION - duration
    nextStart -= fix
    if (clip.type === 'video') trimStart = Math.max(0, trimStart - fix)
    duration = MIN_CLIP_DURATION
  }
  return {
    ...clip,
    startTime: Math.max(0, nextStart),
    duration,
    trimStart: Math.max(0, trimStart),
    auto: false,
  }
}

export function snapPoints(clips: readonly Clip[], duration: number, playhead: number, ignoreId?: string): number[] {
  const points = [0, duration, playhead]
  for (const clip of clips) {
    if (clip.id === ignoreId) continue
    points.push(clip.startTime, clip.startTime + clip.duration)
  }
  return points
}
