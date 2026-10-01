import { useState } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Slider } from '@/components/ui/slider.tsx'
import { clamp, formatClock, parseUserTime } from '@/lib/format.ts'
import { videoSlotNote } from '@/lib/timeline.ts'
import { usePlayback } from '@/store/playbackStore.ts'
import { useProject } from '@/store/projectStore.ts'
import type { Clip, FitMode } from '@/types/project.ts'
import { cn } from '@/lib/cn.ts'

export function Inspector() {
  const selectedId = usePlayback((state) => state.selectedClipId)
  const clip = useProject((state) => state.clips.find((item) => item.id === selectedId) ?? null)

  return (
    <aside className="flex min-h-0 flex-1 flex-col overflow-auto border-t border-line">
      <div className="flex h-9 shrink-0 items-center border-b border-line px-3 text-[11px] tracking-wide text-muted uppercase">
        Clip
      </div>
      {clip ? <ClipInspector clip={clip} /> : (
        <p className="px-3 py-4 text-[12px] leading-5 text-muted">
          Click an image to show it. Press Space to play the voiceover.
        </p>
      )}
    </aside>
  )
}

function ClipInspector({ clip }: { clip: Clip }) {
  const updateClip = useProject((state) => state.updateClip)
  const deleteClip = useProject((state) => state.deleteClip)
  const note = videoSlotNote(clip)

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <p className="truncate text-[13px]" title={clip.name}>
          {clip.name}
        </p>
        <p className="mt-0.5 text-[11px] text-muted tabular-nums">
          {clip.type === 'video' ? 'Video' : 'Image'} · {formatClock(clip.startTime)}
        </p>
      </div>
      <TimeField
        label="Starts"
        value={clip.startTime}
        onCommit={(time) => updateClip(clip.id, { startTime: time, auto: false })}
      />
      <TimeField
        label="Length"
        value={clip.duration}
        onCommit={(duration) =>
          updateClip(clip.id, { duration: clamp(duration, 0.1, 60 * 60 * 2), auto: false })
        }
      />
      <p className="text-[12px] text-muted">On screen until {formatClock(clip.startTime + clip.duration)}.</p>
      <FrameAdjust clip={clip} />
      {clip.type === 'video' ? (
        <>
          <SliderField
            label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={clip.muted ? 0 : clip.volume}
            display={clip.muted ? 'Mute' : `${Math.round(clip.volume * 100)}%`}
            onChange={(volume) => updateClip(clip.id, { volume, muted: false }, 'merge')}
          />
          <label className="flex items-center gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={clip.muted}
              onChange={(event) => updateClip(clip.id, { muted: event.target.checked })}
            />
            Mute clip
          </label>
          <SliderField
            label="Fade in"
            min={0}
            max={2}
            step={0.05}
            value={clip.fadeIn}
            display={`${clip.fadeIn.toFixed(2)}s`}
            onChange={(fadeIn) => updateClip(clip.id, { fadeIn }, 'merge')}
          />
          <SliderField
            label="Fade out"
            min={0}
            max={2}
            step={0.05}
            value={clip.fadeOut}
            display={`${clip.fadeOut.toFixed(2)}s`}
            onChange={(fadeOut) => updateClip(clip.id, { fadeOut }, 'merge')}
          />
        </>
      ) : null}
      {note === 'trimmed' ? (
        <p className="text-[11px] leading-4 text-warn">
          The source is longer than this slot, so playback and export use only the visible part.
        </p>
      ) : null}
      {note === 'holds' ? (
        <p className="text-[11px] leading-4 text-muted">
          The source is shorter than this slot. The last frame holds.
        </p>
      ) : null}
      <Button variant="outline" className="self-start" onClick={() => deleteClip(clip.id)}>
        Remove
      </Button>
    </div>
  )
}

function FrameAdjust({ clip }: { clip: Clip }) {
  const [open, setOpen] = useState(false)
  const updateClip = useProject((state) => state.updateClip)
  if (!open) {
    return (
      <button type="button" className="self-start cursor-pointer text-[12px] text-muted hover:text-text" onClick={() => setOpen(true)}>
        Adjust photo
      </button>
    )
  }
  return (
    <>
      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
        <span className="text-[11px] text-muted">Frame</span>
        <div className="flex border border-line">
          <FrameButton mode="fit" current={clip.fit} onSelect={(fit) => updateClip(clip.id, { fit }, 'merge')} />
          <FrameButton mode="fill" current={clip.fit} onSelect={(fit) => updateClip(clip.id, { fit }, 'merge')} />
        </div>
      </div>
      <SliderField
        label="Scale"
        min={0.25}
        max={3}
        step={0.01}
        value={clip.scale}
        display={`${Math.round(clip.scale * 100)}%`}
        onChange={(scale) => updateClip(clip.id, { scale }, 'merge')}
      />
      <SliderField
        label="Position X"
        min={-100}
        max={100}
        step={1}
        value={clip.positionX}
        display={String(Math.round(clip.positionX))}
        onChange={(positionX) => updateClip(clip.id, { positionX }, 'merge')}
      />
      <SliderField
        label="Position Y"
        min={-100}
        max={100}
        step={1}
        value={clip.positionY}
        display={String(Math.round(clip.positionY))}
        onChange={(positionY) => updateClip(clip.id, { positionY }, 'merge')}
      />
      <Button
        variant="ghost"
        className="self-start px-0"
        onClick={() =>
          updateClip(clip.id, { scale: 1, positionX: 0, positionY: 0, fit: 'fit' }, 'push')
        }
      >
        Reset frame
      </Button>
    </>
  )
}

function FrameButton({
  mode,
  current,
  onSelect,
}: {
  mode: FitMode
  current: FitMode
  onSelect: (mode: FitMode) => void
}) {
  const selected = mode === current
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'h-7 flex-1 text-[12px] capitalize',
        selected ? 'bg-elevated text-text' : 'text-muted hover:text-text',
      )}
      onClick={() => onSelect(mode)}
    >
      {mode}
    </button>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)_36px] items-center gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        aria-label={label}
        onValueChange={([next]) => {
          if (next != null) onChange(next)
        }}
      />
      <span className="text-right tabular-nums text-[11px] text-muted">{display}</span>
    </label>
  )
}

function TimeField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? formatClock(value)
  return (
    <label className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <input
        aria-label={label}
        value={text}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const parsed = parseUserTime(text)
          setDraft(null)
          if (parsed == null) return
          onCommit(parsed)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="h-7 border border-line bg-bg px-1.5 tabular-nums text-[12px] focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      />
    </label>
  )
}
