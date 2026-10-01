import { Pause, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Slider } from '@/components/ui/slider.tsx'
import { clock } from '@/lib/clock.ts'
import { engine } from '@/lib/engine.ts'
import { formatClock, formatPrecise } from '@/lib/format.ts'
import { projectDuration } from '@/lib/timeline.ts'
import { useProject } from '@/store/projectStore.ts'

export function Transport() {
  const duration = useProject((state) => projectDuration(state.audio?.duration ?? null, state.clips))
  const voiceoverVolume = useProject((state) => state.voiceoverVolume)
  const hasVideo = useProject((state) => state.clips.some((clip) => clip.type === 'video'))
  const videoMix = useProject((state) => state.videoMix)
  const setVoiceoverVolume = useProject((state) => state.setVoiceoverVolume)
  const setVideoMix = useProject((state) => state.setVideoMix)

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-t border-line px-3">
      <PlayButton />
      <ClockReadout duration={duration} />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <MixControl label="Voiceover" value={voiceoverVolume} onChange={setVoiceoverVolume} />
        {hasVideo ? <MixControl label="Video audio" value={videoMix} onChange={setVideoMix} /> : null}
      </div>
    </div>
  )
}

function PlayButton() {
  const [playing, setPlaying] = useState(() => engine.getPlaying())
  useEffect(() => engine.subscribe(() => setPlaying(engine.getPlaying())), [])
  return (
    <button
      type="button"
      aria-label={playing ? 'Pause' : 'Play'}
      title={playing ? 'Pause (Space)' : 'Play (Space)'}
      className="flex size-7 items-center justify-center border border-line hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-accent"
      onClick={() => engine.toggle()}
    >
      {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
  )
}

function ClockReadout({ duration }: { duration: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const draw = (time: number) => {
      node.textContent = `${formatPrecise(time)} / ${formatClock(duration)}`
    }
    draw(clock.time)
    return clock.subscribe(draw)
  }, [duration])
  return <span ref={ref} className="tabular-nums text-[12px]" />
}

function MixControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <Slider
        className="w-20"
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        aria-label={label}
        onValueChange={([next]) => {
          if (next != null) onChange(next)
        }}
      />
      <span className="w-8 tabular-nums text-[11px] text-muted">{Math.round(value * 100)}%</span>
    </label>
  )
}
