import type { PointerEvent as ReactPointerEvent } from 'react'
import { formatClock, rulerStep } from '@/lib/format.ts'

export function TimeRuler({
  pixelsPerSecond,
  scrollLeft,
  viewWidth,
  duration,
  onSeekStart,
}: {
  pixelsPerSecond: number
  scrollLeft: number
  viewWidth: number
  duration: number
  onSeekStart: (event: ReactPointerEvent<HTMLDivElement>) => void
}) {
  const step = rulerStep(pixelsPerSecond)
  const viewStart = scrollLeft / pixelsPerSecond
  const viewEnd = (scrollLeft + viewWidth) / pixelsPerSecond
  const first = Math.max(0, Math.floor(viewStart / step) * step)
  const ticks: number[] = []
  for (let time = first; time <= viewEnd + step && time <= duration + step; time += step) {
    ticks.push(Number(time.toFixed(3)))
  }

  return (
    <div
      className="relative h-7 cursor-ew-resize border-b border-line"
      onPointerDown={onSeekStart}
    >
      {ticks.map((time) => (
        <div
          key={time}
          className="absolute top-0 flex h-full flex-col justify-end"
          style={{ left: time * pixelsPerSecond }}
        >
          <span className="absolute top-1 left-1 text-[10px] text-faint tabular-nums">
            {formatClock(time)}
          </span>
          <span className="h-2 w-px bg-line" />
        </div>
      ))}
    </div>
  )
}
