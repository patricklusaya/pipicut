import { useEffect, useRef } from 'react'
import { clock } from '@/lib/clock.ts'

export function Playhead({ pixelsPerSecond }: { pixelsPerSecond: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const draw = (time: number) => {
      node.style.transform = `translateX(${time * pixelsPerSecond}px)`
    }
    draw(clock.time)
    return clock.subscribe(draw)
  }, [pixelsPerSecond])

  return (
    <div ref={ref} className="pointer-events-none absolute inset-y-0 z-20 w-px bg-playhead">
      <div className="absolute top-0 left-0 size-2 -translate-x-1/2 bg-playhead" />
    </div>
  )
}
