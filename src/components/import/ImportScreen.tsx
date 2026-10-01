import { AudioLines, FolderOpen, ImageIcon } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark.tsx'
import { DropZone } from '@/components/import/DropZone.tsx'
import { ExtensionButton } from '@/components/import/ExtensionButton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { useFileDrop } from '@/hooks/useFileDrop.ts'
import { formatClock } from '@/lib/format.ts'
import { AUDIO_ACCEPT, VISUAL_ACCEPT } from '@/lib/media.ts'
import { useProject } from '@/store/projectStore.ts'

export function ImportScreen() {
  const importFiles = useProject((state) => state.importFiles)
  const importing = useProject((state) => state.importing)
  const importError = useProject((state) => state.importError)
  const audio = useProject((state) => state.audio)
  const openTimeline = useProject((state) => state.openTimeline)
  const dragging = useFileDrop((files) => {
    void importFiles(files)
  })

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center border-b border-line px-4">
        <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <BrandMark className="size-5" />
          Pipicut
        </span>
        {importing ? <span className="ml-4 text-[12px] text-muted">Reading media…</span> : null}
        <div className="ml-auto">
          <ExtensionButton />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <DropZone
          title="Voiceover"
          hint={audio ? `${audio.name} · ${formatClock(audio.duration)}` : 'Optional. MP3 or WAV'}
          action={audio ? 'Replace voiceover' : 'Choose voiceover'}
          accept={AUDIO_ACCEPT}
          disabled={importing}
          icon={<AudioLines className="size-3.5" aria-hidden="true" />}
          actionIcon={<FolderOpen className="size-3.5" aria-hidden="true" />}
          className="order-2 min-h-36 border-t border-line lg:order-1 lg:w-[280px] lg:min-h-0 lg:border-t-0 lg:border-r"
          onFiles={(files) => {
            void importFiles(files)
          }}
        />
        <main className="order-1 flex min-h-48 flex-1 flex-col items-center justify-center px-8 py-10 text-center lg:order-2">
          <h1 className="max-w-sm text-[15px] font-medium">Drop the photos, and an MP3 if you have one.</h1>
          <p className="mt-3 max-w-sm text-[13px] leading-5 text-muted">
            Name photos <code className="text-text">0-00.png</code>, <code className="text-text">0-14.png</code>, or{' '}
            <code className="text-text">1-03.png</code>. Minutes, then seconds 00–59. That stamp is when the photo
            appears.
          </p>
          {importError ? <p className="mt-4 text-[12px] text-danger">{importError}</p> : null}
          {audio ? (
            <Button className="mt-5" onClick={openTimeline}>
              Open timeline
            </Button>
          ) : null}
        </main>
        <DropZone
          title="Photos"
          hint="PNG, JPG, or video. Names like 0-14.png"
          action="Choose files"
          accept={VISUAL_ACCEPT}
          multiple
          disabled={importing}
          icon={<ImageIcon className="size-3.5" aria-hidden="true" />}
          actionIcon={<FolderOpen className="size-3.5" aria-hidden="true" />}
          className="order-3 min-h-36 border-t border-line lg:w-[280px] lg:min-h-0 lg:border-t-0 lg:border-l"
          onFiles={(files) => {
            void importFiles(files)
          }}
        />
      </div>
      <footer className="flex h-9 shrink-0 items-center border-t border-line px-4 text-[12px]">
        <a href="#prompt" className="text-accent">
          Master prompt
        </a>
        <span className="ml-auto hidden text-muted sm:inline">
          Paste into Gemini with Name files from timestamps on
        </span>
      </footer>
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-40 border-2 border-accent bg-black/40">
          <div className="flex h-full items-center justify-center text-[13px]">Drop to import</div>
        </div>
      ) : null}
    </div>
  )
}
