import { memo } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clock } from '@/lib/clock.ts'
import { engine } from '@/lib/engine.ts'
import { snapRange, snapTime } from '@/lib/snap.ts'
import { projectDuration, snapPoints, withTrim } from '@/lib/timeline.ts'
import { formatClock, formatDuration } from '@/lib/format.ts'
import { usePlayback } from '@/store/playbackStore.ts'
import { useProject } from '@/store/projectStore.ts'
import type { Clip } from '@/types/project.ts'
import { cn } from '@/lib/cn.ts'

export const ClipBlock = memo(function ClipBlock({
  clip,
  selected,
  pixelsPerSecond,
}: {
  clip: Clip
  selected: boolean
  pixelsPerSecond: number
}) {
  const width = Math.max(clip.duration * pixelsPerSecond, 4)
  return (
    <div
      className={cn(
        'absolute overflow-hidden border bg-[#2a2c31]',
        selected ? 'z-10 border-accent' : 'border-[#3c3f46]',
      )}
      style={{ left: clip.startTime * pixelsPerSecond, width, top: 4, bottom: 4 }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${clip.name}, starts at ${formatClock(clip.startTime)}, ${formatDuration(clip.duration)}`}
      onPointerDown={(event) => startDrag(event, clip, 'move', pixelsPerSecond)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        usePlayback.getState().select(clip.id)
        engine.seek(clip.startTime)
      }}
    >
      {clip.thumbnailUrl ? (
        <img src={clip.thumbnailUrl} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="h-full w-full bg-black/30" />
      )}
      <span className="absolute top-1 left-1 rounded bg-black/70 px-1 text-[10px] tabular-nums">
        {formatDuration(clip.duration)}
      </span>
      <span className="absolute right-1 bottom-1 left-1 truncate text-[10px] text-white/80">
        {formatClock(clip.startTime)}
      </span>
      <span
        aria-label={`Trim start of ${clip.name}`}
        className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize"
        onPointerDown={(event) => startDrag(event, clip, 'start', pixelsPerSecond)}
      />
      <span
        aria-label={`Trim end of ${clip.name}`}
        className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize"
        onPointerDown={(event) => startDrag(event, clip, 'end', pixelsPerSecond)}
      />
    </div>
  )
})

function startDrag(
  event: ReactPointerEvent,
  clip: Clip,
  edge: 'move' | 'start' | 'end',
  pixelsPerSecond: number,
): void {
  if (event.button !== 0) return
  event.stopPropagation()
  event.preventDefault()
  usePlayback.getState().select(clip.id)
  const originX = event.clientX
  const origin = { start: clip.startTime, duration: clip.duration, trim: clip.trimStart }
  let dragging = false

  const move = (ev: PointerEvent) => {
    const deltaPx = ev.clientX - originX
    if (!dragging && Math.abs(deltaPx) < 2) return
    if (!dragging) {
      dragging = true
      useProject.getState().beginGesture()
    }
    const state = useProject.getState()
    const duration = projectDuration(state.audio?.duration ?? null, state.clips)
    const points = snapPoints(state.clips, duration, clock.time, clip.id)
    const threshold = usePlayback.getState().snap ? 8 / pixelsPerSecond : 0
    const delta = deltaPx / pixelsPerSecond
    const base = { ...clip, startTime: origin.start, duration: origin.duration, trimStart: origin.trim }
    if (edge === 'move') {
      let start = Math.max(0, origin.start + delta)
      if (threshold > 0) start = snapRange(start, origin.duration, points, threshold)
      useProject.getState().updateClip(clip.id, { startTime: start, auto: false }, 'skip')
      return
    }
    if (edge === 'end') {
      let end = origin.start + origin.duration + delta
      if (threshold > 0) end = snapTime(end, points, threshold)
      useProject.getState().updateClip(clip.id, withTrim(base, 'end', end), 'skip')
      return
    }
    let start = origin.start + delta
    if (threshold > 0) start = snapTime(start, points, threshold)
    useProject.getState().updateClip(clip.id, withTrim(base, 'start', start), 'skip')
  }

  const up = () => {
    if (dragging) useProject.getState().endGesture()
    else if (edge === 'move') engine.seek(origin.start)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
