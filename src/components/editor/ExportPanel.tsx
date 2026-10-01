import type { ReactNode, SelectHTMLAttributes } from 'react'
import { AudioLines } from 'lucide-react'
import { FilePickerButton } from '@/components/import/FilePickerButton.tsx'
import { Slider } from '@/components/ui/slider.tsx'
import { Button } from '@/components/ui/button.tsx'
import { formatPrecise } from '@/lib/format.ts'
import { AUDIO_ACCEPT } from '@/lib/media.ts'
import { exportSpan, projectDuration } from '@/lib/timeline.ts'
import { outputSize } from '@/lib/transform.ts'
import { useExport } from '@/store/exportStore.ts'
import { useProject } from '@/store/projectStore.ts'
import type { AspectRatio, ExportQuality } from '@/types/project.ts'

export function ExportPanel() {
  const aspect = useProject((state) => state.aspect)
  const fps = useProject((state) => state.fps)
  const quality = useProject((state) => state.quality)
  const setAspect = useProject((state) => state.setAspect)
  const setFps = useProject((state) => state.setFps)
  const setQuality = useProject((state) => state.setQuality)
  const clipItems = useProject((state) => state.clips)
  const audioDuration = useProject((state) => state.audio?.duration ?? null)
  const fullLength = projectDuration(audioDuration, clipItems)
  const duration = exportSpan(audioDuration, fullLength)
  const photosInFile = clipItems.filter((clip) => clip.startTime < duration - 0.04).length
  const photosLeftOut = clipItems.length - photosInFile
  const hasAudio = audioDuration != null
  const voiceoverVolume = useProject((state) => state.voiceoverVolume)
  const setVoiceoverVolume = useProject((state) => state.setVoiceoverVolume)
  const hasVideo = useProject((state) => state.clips.some((clip) => clip.type === 'video'))
  const videoMix = useProject((state) => state.videoMix)
  const setVideoMix = useProject((state) => state.setVideoMix)
  const exportPhase = useExport((state) => state.phase)
  const startExport = useExport((state) => state.start)
  const frame = outputSize(aspect, quality)

  return (
    <aside className="flex w-full shrink-0 flex-col border-t border-line bg-panel lg:w-[280px] lg:border-t-0 lg:border-l">
      <div className="flex h-9 shrink-0 items-center border-b border-line px-3 text-[11px] tracking-wide text-muted uppercase">
        Export
      </div>
      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Aspect">
            <Select
              aria-label="Aspect"
              value={aspect}
              onChange={(value) => setAspect(value as AspectRatio)}
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </Select>
          </Field>
          <Field label="FPS">
            <Select aria-label="FPS" value={String(fps)} onChange={(value) => setFps(value === '24' ? 24 : 30)}>
              <option value="24">24</option>
              <option value="30">30</option>
            </Select>
          </Field>
          <Field label="Quality">
            <Select
              aria-label="Quality"
              value={quality}
              onChange={(value) => setQuality(value as ExportQuality)}
            >
              <option value="full">Full</option>
              <option value="draft">Fast</option>
            </Select>
          </Field>
        </div>
        <Stat label="Resolution" value={`${frame.width}×${frame.height}`} />
        <Stat label="Photos" value={String(photosInFile)} />
        <Stat label="Length" value={formatPrecise(duration)} />
        {photosLeftOut > 0 ? (
          <p className="text-[12px] leading-5 text-muted">
            {photosLeftOut === 1
              ? '1 photo starts after the voiceover and stays out of the file.'
              : `${photosLeftOut} photos start after the voiceover and stay out of the file.`}
          </p>
        ) : null}
        {hasVideo ? null : (
          <p className="text-[12px] leading-5 text-muted">
            Still photos skip the repeated frames, so export finishes much faster.
          </p>
        )}
        <Button variant="primary" disabled={exportPhase === 'running'} onClick={startExport}>
          Export
        </Button>
        {hasAudio ? (
          <label className="flex flex-col gap-2 pt-1">
            <span className="flex items-center justify-between text-[12px]">
              Voiceover
              <span className="tabular-nums text-muted">{Math.round(voiceoverVolume * 100)}%</span>
            </span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[voiceoverVolume]}
              aria-label="Voiceover"
              onValueChange={([next]) => {
                if (next != null) setVoiceoverVolume(next)
              }}
            />
          </label>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-[12px] leading-5 text-muted">No voiceover yet. Add an MP3 or WAV.</p>
            <FilePickerButton
              label="Add voiceover"
              accept={AUDIO_ACCEPT}
              icon={<AudioLines className="size-3.5" aria-hidden="true" />}
            />
          </div>
        )}
        {hasVideo ? (
          <label className="flex flex-col gap-2">
            <span className="flex items-center justify-between text-[12px]">
              Video audio
              <span className="tabular-nums text-muted">{Math.round(videoMix * 100)}%</span>
            </span>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[videoMix]}
              aria-label="Video audio"
              onValueChange={([next]) => {
                if (next != null) setVideoMix(next)
              }}
            />
          </label>
        ) : null}
      </div>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-muted uppercase">{label}</span>
      {children}
    </label>
  )
}

function Select({
  children,
  value,
  onChange,
  ...props
}: {
  children: ReactNode
  value: string
  onChange: (value: string) => void
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return (
    <select
      {...props}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 border border-line bg-bg px-1 text-[12px] focus:outline focus:outline-1 focus:outline-accent"
    >
      {children}
    </select>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}
