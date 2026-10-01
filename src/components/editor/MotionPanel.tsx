import { useState } from 'react'
import { Slider } from '@/components/ui/slider.tsx'
import { Button } from '@/components/ui/button.tsx'
import { EFFECT_LABELS, VISUAL_EFFECTS } from '@/lib/effects.ts'
import { useProject } from '@/store/projectStore.ts'
import { cn } from '@/lib/cn.ts'

type MotionTab = 'motion' | 'transitions' | 'effects'

export function MotionPanel() {
  const [tab, setTab] = useState<MotionTab>('motion')
  return (
    <section className="flex shrink-0 flex-col">
      <div className="flex h-9 border-b border-line">
        <TabButton current={tab} id="motion" onSelect={setTab}>
          Motion
        </TabButton>
        <TabButton current={tab} id="transitions" onSelect={setTab}>
          Transitions
        </TabButton>
        <TabButton current={tab} id="effects" onSelect={setTab}>
          Effects
        </TabButton>
      </div>
      {tab === 'motion' ? <MotionTab /> : tab === 'transitions' ? <TransitionsTab /> : <EffectsTab />}
    </section>
  )
}

function TabButton({
  current,
  id,
  onSelect,
  children,
}: {
  current: MotionTab
  id: MotionTab
  onSelect: (id: MotionTab) => void
  children: string
}) {
  const selected = current === id
  return (
    <button
      type="button"
      className={cn(
        'px-3 text-[12px]',
        selected ? 'text-text' : 'text-muted hover:text-text',
      )}
      aria-pressed={selected}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  )
}

function MotionTab() {
  const zoomDepth = useProject((state) => state.zoomDepth)
  const zoomDirection = useProject((state) => state.zoomDirection)
  const setZoomDepth = useProject((state) => state.setZoomDepth)
  const setZoomDirection = useProject((state) => state.setZoomDirection)
  const percent = Math.round(zoomDepth * 100)

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <p className="text-[11px] tracking-wide text-muted uppercase">Motion — slow zoom</p>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          Every image moves {percent}% while it is on screen. Play to see it.
        </p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between text-[12px]">
          Zoom depth
          <span className="tabular-nums text-muted">{percent}%</span>
        </span>
        <Slider
          min={0}
          max={0.4}
          step={0.01}
          value={[zoomDepth]}
          aria-label="Zoom depth"
          onValueChange={([next]) => {
            if (next != null) setZoomDepth(next)
          }}
        />
      </label>
      <div className="flex gap-2">
        <Button
          variant={zoomDirection === 'in' ? 'primary' : 'outline'}
          onClick={() => {
            setZoomDirection('in')
            if (zoomDepth < 0.02) setZoomDepth(0.08)
          }}
        >
          Zoom in all
        </Button>
        <Button
          variant={zoomDirection === 'out' ? 'primary' : 'outline'}
          onClick={() => {
            setZoomDirection('out')
            if (zoomDepth < 0.02) setZoomDepth(0.08)
          }}
        >
          Zoom out all
        </Button>
      </div>
    </div>
  )
}

function TransitionsTab() {
  const crossfade = useProject((state) => state.crossfade)
  const setCrossfade = useProject((state) => state.setCrossfade)
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <div>
        <p className="text-[11px] tracking-wide text-muted uppercase">Transitions — dissolve</p>
        <p className="mt-1 text-[12px] leading-5 text-muted">
          One dissolve between images. The export uses the same blend.
        </p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between text-[12px]">
          Dissolve
          <span className="tabular-nums text-muted">
            {crossfade < 0.02 ? 'Cut' : `${crossfade.toFixed(2)}s`}
          </span>
        </span>
        <Slider
          min={0}
          max={0.8}
          step={0.05}
          value={[crossfade]}
          aria-label="Dissolve length"
          onValueChange={([next]) => {
            if (next != null) setCrossfade(next)
          }}
        />
      </label>
      <div className="flex gap-2">
        <Button variant={crossfade < 0.02 ? 'primary' : 'outline'} onClick={() => setCrossfade(0)}>
          Cut
        </Button>
        <Button variant={crossfade >= 0.02 ? 'primary' : 'outline'} onClick={() => setCrossfade(0.35)}>
          Soft
        </Button>
      </div>
    </div>
  )
}

function EffectsTab() {
  const effect = useProject((state) => state.effect)
  const setEffect = useProject((state) => state.setEffect)
  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      <p className="text-[12px] leading-5 text-muted">
        One look for the whole video. It shows in the preview and in the export.
      </p>
      <div className="flex flex-wrap gap-2">
        {VISUAL_EFFECTS.map((id) => (
          <Button key={id} variant={effect === id ? 'primary' : 'outline'} onClick={() => setEffect(id)}>
            {EFFECT_LABELS[id]}
          </Button>
        ))}
      </div>
    </div>
  )
}
