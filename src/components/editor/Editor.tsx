import { useEffect } from 'react'
import { ExportBar } from '@/components/editor/ExportBar.tsx'
import { ExportPanel } from '@/components/editor/ExportPanel.tsx'
import { MotionPanel } from '@/components/editor/MotionPanel.tsx'
import { TopBar } from '@/components/editor/TopBar.tsx'
import { IssuesBar } from '@/components/issues/IssuesBar.tsx'
import { Inspector } from '@/components/inspector/Inspector.tsx'
import { PreviewStage } from '@/components/preview/PreviewStage.tsx'
import { Timeline } from '@/components/timeline/Timeline.tsx'
import { useEditorShortcuts } from '@/hooks/useEditorShortcuts.ts'
import { useFileDrop } from '@/hooks/useFileDrop.ts'
import { engine } from '@/lib/engine.ts'
import { projectDuration } from '@/lib/timeline.ts'
import { useProject } from '@/store/projectStore.ts'

export function Editor() {
  const importFiles = useProject((state) => state.importFiles)
  const audioUrl = useProject((state) => state.audio?.url ?? null)
  const audioDuration = useProject((state) => state.audio?.duration ?? 0)
  const duration = useProject((state) => projectDuration(state.audio?.duration ?? null, state.clips))
  const voiceoverVolume = useProject((state) => state.voiceoverVolume)
  const dragging = useFileDrop((files) => {
    void importFiles(files)
  })

  useEditorShortcuts()

  useEffect(() => {
    engine.setAudio(audioUrl, audioDuration)
  }, [audioUrl, audioDuration])

  useEffect(() => {
    engine.setDuration(duration)
  }, [duration])

  useEffect(() => {
    engine.setVoiceVolume(voiceoverVolume)
  }, [voiceoverVolume])

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <TopBar />
      <ExportBar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="flex max-h-64 w-full shrink-0 flex-col overflow-auto border-b border-line bg-panel lg:max-h-none lg:w-[300px] lg:border-r lg:border-b-0">
          <MotionPanel />
          <Inspector />
        </aside>
        <div className="flex min-h-[240px] min-w-0 flex-1 flex-col">
          <PreviewStage />
        </div>
        <ExportPanel />
      </div>
      <IssuesBar />
      <Timeline />
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 border-2 border-accent bg-black/35">
          <div className="flex h-full items-center justify-center text-[13px]">Drop to add to the timeline</div>
        </div>
      ) : null}
    </div>
  )
}
