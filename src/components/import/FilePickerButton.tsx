import { useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { useProject } from '@/store/projectStore.ts'

export function FilePickerButton({
  label,
  accept,
  multiple,
  variant = 'outline',
  icon,
}: {
  label: string
  accept: string
  multiple?: boolean
  variant?: 'primary' | 'ghost' | 'outline'
  icon?: ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const importFiles = useProject((state) => state.importFiles)
  const importing = useProject((state) => state.importing)

  return (
    <>
      <Button variant={variant} disabled={importing} onClick={() => inputRef.current?.click()}>
        {icon}
        {label}
      </Button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        aria-label={label}
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          if (files.length > 0) void importFiles(files)
          event.target.value = ''
        }}
      />
    </>
  )
}
