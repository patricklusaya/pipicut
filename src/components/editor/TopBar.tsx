import { AudioLines, Check, ImageIcon } from 'lucide-react'
import { useState } from 'react'
import { BrandMark } from '@/components/brand/BrandMark.tsx'
import { FilePickerButton } from '@/components/import/FilePickerButton.tsx'
import { ExtensionButton } from '@/components/import/ExtensionButton.tsx'
import { Button } from '@/components/ui/button.tsx'
import { ConfirmDialog } from '@/components/ui/confirm-dialog.tsx'
import { AUDIO_ACCEPT, VISUAL_ACCEPT } from '@/lib/media.ts'
import { useProject } from '@/store/projectStore.ts'

export function TopBar() {
  const name = useProject((state) => state.name)
  const setName = useProject((state) => state.setName)
  const audioName = useProject((state) => state.audio?.name ?? null)
  const clipCount = useProject((state) => state.clips.length)
  const importing = useProject((state) => state.importing)
  const storageNote = useProject((state) => state.storageNote)
  const newProject = useProject((state) => state.newProject)
  const [confirming, setConfirming] = useState(false)

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
        <BrandMark className="size-5" />
        Pipicut
      </span>
      <input
        aria-label="Project name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-7 w-40 border border-transparent bg-transparent px-1.5 text-[13px] hover:border-line focus:border-line focus:outline-none"
      />
      <div className="ml-auto flex items-center gap-3">
        {importing ? <span className="text-[11px] text-muted">Reading media…</span> : null}
        {storageNote ? <span className="hidden text-[11px] text-faint sm:inline">{storageNote}</span> : null}
        {audioName ? <StatusChip label={audioName} /> : null}
        <StatusChip label={`${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`} />
        <a href="#prompt" className="text-[12px] text-muted hover:text-text">
          Master prompt
        </a>
        <ExtensionButton />
        <FilePickerButton
          label={audioName ? 'Replace voiceover' : 'Add voiceover'}
          accept={AUDIO_ACCEPT}
          icon={<AudioLines className="size-3.5" aria-hidden="true" />}
        />
        <FilePickerButton
          label="Add photos"
          accept={VISUAL_ACCEPT}
          multiple
          icon={<ImageIcon className="size-3.5" aria-hidden="true" />}
        />
        <Button variant="ghost" onClick={() => setConfirming(true)}>
          New
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Start a new project?"
        description="This clears the current timeline from this browser. Your original files stay where they are."
        confirmLabel="New project"
        onOpenChange={setConfirming}
        onConfirm={() => {
          newProject()
          setConfirming(false)
        }}
      />
    </header>
  )
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="hidden max-w-40 items-center gap-1 truncate text-[12px] text-muted sm:inline-flex">
      <Check className="size-3.5 shrink-0 text-[#7dcea0]" />
      <span className="truncate">{label}</span>
    </span>
  )
}
