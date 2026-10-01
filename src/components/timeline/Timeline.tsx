import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ClipBlock } from '@/components/timeline/ClipBlock.tsx'
import { Playhead } from '@/components/timeline/Playhead.tsx'
import { TimeRuler } from '@/components/timeline/TimeRuler.tsx'
import { Waveform } from '@/components/timeline/Waveform.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Tooltip } from '@/components/ui/tooltip.tsx'
import { clock } from '@/lib/clock.ts'
import { engine } from '@/lib/engine.ts'
import { projectDuration } from '@/lib/timeline.ts'
import { MAX_PIXELS_PER_SECOND, MIN_PIXELS_PER_SECOND, usePlayback } from '@/store/playbackStore.ts'
import { useProject } from '@/store/projectStore.ts'

export function Timeline() {
  const pixelsPerSecond = usePlayback((state) => state.pixelsPerSecond)
  const selectedId = usePlayback((state) => state.selectedClipId)
  const clips = useProject((state) => state.clips)
  const duration = useProject((state) => projectDuration(state.audio?.duration ?? null, state.clips))
  const scrollerRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)
  const fittedRef = useRef(false)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewWidth, setViewWidth] = useState(0)

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    const observer = new ResizeObserver(() => setViewWidth(node.clientWidth))
    observer.observe(node)
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setScrollLeft(node.scrollLeft)
      })
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        usePlayback.getState().zoomBy(event.deltaY > 0 ? 0.9 : 1.1)
        return
      }
      followRef.current = false
    }
    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('wheel', onWheel)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    return engine.subscribe(() => {
      if (engine.getPlaying()) followRef.current = true
    })
  }, [])

  useEffect(() => {
    return clock.subscribe((time) => {
      const node = scrollerRef.current
      if (!node || !followRef.current || !engine.getPlaying()) return
      const x = time * pixelsPerSecond
      const left = node.scrollLeft
      const right = left + node.clientWidth
      if (x < left + 24 || x > right - 48) {
        node.scrollLeft = Math.max(0, x - node.clientWidth * 0.25)
      }
    })
  }, [pixelsPerSecond])

  useEffect(() => {
    if (fittedRef.current || duration <= 0 || viewWidth < 80) return
    fittedRef.current = true
    usePlayback.getState().setZoom((viewWidth - 24) / duration)
  }, [duration, viewWidth])

  const contentWidth = Math.max(duration * pixelsPerSecond + 48, viewWidth)
  const viewStart = scrollLeft / pixelsPerSecond
  const viewEnd = (scrollLeft + viewWidth) / pixelsPerSecond

  const seekFromClientX = (clientX: number) => {
    const node = scrollerRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const x = clientX - rect.left + node.scrollLeft
    engine.seek(Math.min(duration, Math.max(0, x / pixelsPerSecond)))
  }

  const onSeekStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    followRef.current = false
    seekFromClientX(event.clientX)
    const move = (ev: PointerEvent) => seekFromClientX(ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <section className="flex shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        <Tooltip label="Zoom out">
          <Button size="icon" variant="ghost" aria-label="Zoom out" onClick={() => usePlayback.getState().zoomBy(0.8)}>
            <Minus className="size-3.5" />
          </Button>
        </Tooltip>
        <input
          aria-label="Timeline zoom"
          type="range"
          min={Math.log(MIN_PIXELS_PER_SECOND)}
          max={Math.log(MAX_PIXELS_PER_SECOND)}
          step={0.01}
          value={Math.log(pixelsPerSecond)}
          onChange={(event) => usePlayback.getState().setZoom(Math.exp(Number(event.target.value)))}
          className="w-24 accent-[#6ea8fe]"
        />
        <Tooltip label="Zoom in">
          <Button size="icon" variant="ghost" aria-label="Zoom in" onClick={() => usePlayback.getState().zoomBy(1.25)}>
            <Plus className="size-3.5" />
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          onClick={() => {
            if (viewWidth > 0 && duration > 0) {
              usePlayback.getState().setZoom((viewWidth - 24) / duration)
            }
          }}
        >
          Whole voiceover
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-8 shrink-0 border-r border-line text-[11px] text-muted">
          <div className="h-7 border-b border-line" />
          <div className="flex h-[72px] items-center justify-center border-b border-line">V</div>
          <div className="flex h-[72px] items-center justify-center">A</div>
        </div>
        <div ref={scrollerRef} className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
          <div className="relative" style={{ width: contentWidth }}>
            <TimeRuler
              pixelsPerSecond={pixelsPerSecond}
              scrollLeft={scrollLeft}
              viewWidth={viewWidth}
              duration={Math.max(duration, viewEnd)}
              onSeekStart={onSeekStart}
            />
            <div
              className="relative h-[72px] border-b border-line"
              onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return
                usePlayback.getState().select(null)
                onSeekStart(event)
              }}
            >
              {clips.map((clip) => {
                const end = clip.startTime + clip.duration
                if (end < viewStart - 1 || clip.startTime > viewEnd + 1) return null
                return (
                  <ClipBlock
                    key={clip.id}
                    clip={clip}
                    selected={clip.id === selectedId}
                    pixelsPerSecond={pixelsPerSecond}
                  />
                )
              })}
            </div>
            <Waveform scrollLeft={scrollLeft} viewWidth={viewWidth} pixelsPerSecond={pixelsPerSecond} />
            <Playhead pixelsPerSecond={pixelsPerSecond} />
          </div>
        </div>
      </div>
    </section>
  )
}
