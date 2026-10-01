import { Pause, Play, Redo2, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { clock } from '@/lib/clock.ts'
import { engine } from '@/lib/engine.ts'
import { previewGrade } from '@/lib/effects.ts'
import { dissolveOverlap } from '@/lib/exportGraph.ts'
import { formatClock, formatPrecise } from '@/lib/format.ts'
import { clipAtTime, projectDuration } from '@/lib/timeline.ts'
import { fadeOpacity, kenBurnsScale, mediaTransform } from '@/lib/transform.ts'
import { useProject } from '@/store/projectStore.ts'
import type { Clip } from '@/types/project.ts'
import { cn } from '@/lib/cn.ts'

export function PreviewStage() {
  const clips = useProject((state) => state.clips)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const underRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const aspect = useProject((state) => state.aspect)
  const zoomDepth = useProject((state) => state.zoomDepth)
  const effect = useProject((state) => state.effect)
  const activeIdRef = useRef<string | null>(null)

  useEffect(() => {
    const apply = (time: number, playing: boolean) => {
      const project = useProject.getState()
      const currentClips = [...project.clips].sort((a, b) => a.startTime - b.startTime)
      const videoMix = project.videoMix
      const clip = clipAtTime(currentClips, time)
      const nextId = clip?.id ?? null
      if (nextId !== activeIdRef.current) {
        activeIdRef.current = nextId
        setActiveId(nextId)
        setFailedId(null)
      }
      const index = clip ? currentClips.findIndex((item) => item.id === clip.id) : -1
      const previous = index > 0 ? currentClips[index - 1] : null
      const overlap =
        clip && previous ? dissolveOverlap(previous.duration, clip.duration, project.crossfade) : 0
      const local = clip ? time - clip.startTime : 0
      const dissolving =
        Boolean(clip && previous && overlap > 0.02 && local >= 0 && local < overlap) &&
        clip?.type === 'image' &&
        previous?.type === 'image'
      const opacity = clip
        ? dissolving
          ? String(local / overlap)
          : String(fadeOpacity(time, clip.startTime, clip.duration, clip.fadeIn, clip.fadeOut))
        : '0'
      paintStill(
        imageRef.current,
        clip?.type === 'image' ? clip : null,
        clip && clip.duration > 0 ? local / clip.duration : 0,
        opacity,
        project.zoomDepth,
        project.zoomDirection,
      )
      paintStill(
        underRef.current,
        dissolving && previous?.type === 'image' ? previous : null,
        1,
        dissolving ? '1' : '0',
        project.zoomDepth,
        project.zoomDirection,
      )
      const video = videoRef.current
      if (!video) return
      if (!clip || clip.type !== 'video') {
        video.style.opacity = '0'
        if (!video.paused) video.pause()
        return
      }
      video.style.opacity = opacity
      syncVideo(video, clip, time, playing, videoMix)
    }
    engine.setFrameHandler(apply)
    apply(clock.time, engine.getPlaying())
    return () => engine.setFrameHandler(null)
  }, [])

  const active = clips.find((clip) => clip.id === activeId) ?? clipAtTime(clips, clock.time)

  useEffect(() => {
    const video = videoRef.current
    if (!video || active?.type !== 'video') return
    if (video.getAttribute('data-clip-id') === active.id) return
    video.setAttribute('data-clip-id', active.id)
    video.src = active.url
    video.load()
  }, [active])

  const portrait = aspect === '9:16'
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#101113]">
    <div className="grid min-h-0 flex-1 place-items-center p-4 [container-type:size]">
      <div
        className="relative overflow-hidden bg-black"
        style={{
          width: portrait ? 'min(100cqw, calc(100cqh * 9 / 16))' : 'min(100cqw, calc(100cqh * 16 / 9))',
          aspectRatio: portrait ? '9 / 16' : '16 / 9',
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ filter: previewGrade(effect) }}
        >
          <img
            ref={underRef}
            alt=""
            draggable={false}
            className={cn('h-full w-full', zoomDepth > 0.001 ? 'object-cover' : 'object-contain')}
            style={{ opacity: 0 }}
          />
          <img
            ref={imageRef}
            alt=""
            draggable={false}
            className={cn(
              'absolute inset-0 h-full w-full',
              zoomDepth > 0.001 || active?.fit === 'fill' ? 'object-cover' : 'object-contain',
            )}
          />
          <video
            ref={videoRef}
            className={cn(
              'absolute inset-0 h-full w-full',
              active?.fit === 'fill' || zoomDepth > 0.001 ? 'object-cover' : 'object-contain',
            )}
            style={
              active?.type === 'video'
                ? { transform: mediaTransform(active.positionX, active.positionY, active.scale) }
                : undefined
            }
            playsInline
            preload="auto"
            onError={() => {
              if (active?.type === 'video') setFailedId(active.id)
            }}
          />
          {active?.type === 'video' && failedId === active.id ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[12px] leading-5 text-muted">
              This video cannot be previewed in the browser. Export may still work if the file is a
              format the local encoder understands.
            </div>
          ) : null}
          {!active ? (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-[12px] text-faint">
              {clips.length === 0
                ? 'No images yet. Use Add visuals, or drop them onto the window.'
                : 'No image at this moment'}
            </div>
          ) : null}
        </div>
        {effect === 'vignette' ? (
          <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_90px_28px_rgba(0,0,0,0.62)]" />
        ) : null}
        {effect === 'grain' ? <GrainField /> : null}
        {effect === 'snow' ? <SnowField /> : null}
      </div>
    </div>
    <PreviewBar />
    </div>
  )
}

function paintStill(
  node: HTMLImageElement | null,
  clip: Clip | null,
  progress: number,
  opacity: string,
  zoomDepth: number,
  zoomDirection: 'in' | 'out',
): void {
  if (!node) return
  if (!clip) {
    node.style.opacity = '0'
    return
  }
  if (node.getAttribute('data-clip-id') !== clip.id) {
    node.setAttribute('data-clip-id', clip.id)
    node.src = clip.url
  }
  const scale = kenBurnsScale(progress, zoomDepth, zoomDirection, clip.scale)
  node.style.transform = mediaTransform(clip.positionX, clip.positionY, scale)
  node.style.opacity = opacity
}

function PreviewBar() {
  const duration = useProject((state) => projectDuration(state.audio?.duration ?? null, state.clips))
  const undo = useProject((state) => state.undo)
  const redo = useProject((state) => state.redo)
  const canUndo = useProject((state) => state.past.length > 0)
  const canRedo = useProject((state) => state.future.length > 0)
  const [playing, setPlaying] = useState(() => engine.getPlaying())
  const clockRef = useRef<HTMLSpanElement>(null)
  const nowRef = useRef<HTMLSpanElement>(null)
  useEffect(() => engine.subscribe(() => setPlaying(engine.getPlaying())), [])
  useEffect(() => {
    const draw = (time: number) => {
      if (clockRef.current) clockRef.current.textContent = `${formatPrecise(time)} / ${formatClock(duration)}`
      const clips = [...useProject.getState().clips].sort((a, b) => a.startTime - b.startTime)
      const clip = clipAtTime(clips, time)
      const index = clip ? clips.findIndex((item) => item.id === clip.id) : -1
      const text = clip ? `NOW image ${index + 1} / ${clips.length}` : 'No image at this moment'
      if (nowRef.current && nowRef.current.textContent !== text) nowRef.current.textContent = text
    }
    draw(clock.time)
    return clock.subscribe(draw)
  }, [duration])
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-3">
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        className="flex size-7 items-center justify-center rounded-full border border-line hover:bg-white/5"
        onClick={() => engine.toggle()}
      >
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
      </button>
      <span ref={clockRef} className="tabular-nums text-[12px]" />
      <Button size="icon" variant="ghost" aria-label="Undo" disabled={!canUndo} onClick={undo}>
        <Undo2 className="size-3.5" />
      </Button>
      <Button size="icon" variant="ghost" aria-label="Redo" disabled={!canRedo} onClick={redo}>
        <Redo2 className="size-3.5" />
      </Button>
      <span ref={nowRef} className="ml-auto text-[11px] tracking-wide text-muted uppercase" />
    </div>
  )
}

function syncVideo(
  video: HTMLVideoElement,
  clip: Clip,
  time: number,
  playing: boolean,
  videoMix: number,
): void {
  const local = time - clip.startTime + clip.trimStart
  const content = clip.sourceDuration == null ? null : Math.max(0, clip.sourceDuration - clip.trimStart)
  const pastSource = content != null && time - clip.startTime >= content - 0.04
  const target = pastSource && content != null ? clip.trimStart + Math.max(0, content - 0.05) : local
  if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.12) {
    try {
      video.currentTime = Math.max(0, target)
    } catch {
      // The element is still opening the file.
    }
  }
  const base = clip.muted ? 0 : clip.volume * videoMix
  const faded = base * fadeOpacity(time, clip.startTime, clip.duration, clip.fadeIn, clip.fadeOut)
  video.volume = Math.min(1, Math.max(0, faded))
  if (!playing || pastSource) {
    if (!video.paused) video.pause()
    return
  }
  if (video.paused) void video.play().catch(() => undefined)
}

function GrainField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const draw = () => {
      const width = Math.max(1, parent.clientWidth)
      const height = Math.max(1, parent.clientHeight)
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) return
      const image = context.createImageData(width, height)
      for (let index = 0; index < image.data.length; index += 16) {
        const shade = 80 + Math.random() * 175
        image.data[index] = shade
        image.data[index + 1] = shade
        image.data[index + 2] = shade
        image.data[index + 3] = Math.random() > 0.55 ? 90 : 0
      }
      context.putImageData(image, 0, 0)
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" />
}

function SnowField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return
    const context = canvas.getContext('2d')
    if (!context) return
    const flakes = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: 1 + Math.random() * 2.4,
      speed: 0.0015 + Math.random() * 0.004,
      drift: (Math.random() - 0.5) * 0.0015,
    }))
    let frame = 0
    let alive = true
    const draw = () => {
      if (!alive) return
      const width = Math.max(1, parent.clientWidth)
      const height = Math.max(1, parent.clientHeight)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      context.clearRect(0, 0, width, height)
      context.fillStyle = 'rgba(255,255,255,0.9)'
      for (const flake of flakes) {
        flake.y += flake.speed
        flake.x += flake.drift
        if (flake.y > 1) {
          flake.y = 0
          flake.x = Math.random()
        }
        if (flake.x < 0) flake.x = 1
        if (flake.x > 1) flake.x = 0
        context.beginPath()
        context.arc(flake.x * width, flake.y * height, flake.size, 0, Math.PI * 2)
        context.fill()
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      alive = false
      cancelAnimationFrame(frame)
    }
  }, [])
  return <canvas ref={ref} className="pointer-events-none absolute inset-0" />
}
