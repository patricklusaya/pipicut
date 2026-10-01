import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn.ts'

export function DropZone({
  title,
  hint,
  action,
  accept,
  multiple,
  disabled,
  icon,
  actionIcon,
  className,
  onFiles,
}: {
  title: string
  hint: string
  action: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  icon?: ReactNode
  actionIcon?: ReactNode
  className?: string
  onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex w-full cursor-pointer flex-col bg-panel text-left transition-colors',
        'hover:bg-elevated focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3 text-[11px] tracking-wide text-muted uppercase">
        {icon}
        <h2>{title}</h2>
      </div>
      <div className="flex flex-1 flex-col px-4 py-4">
        <p className="text-[13px] text-text">{hint}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-accent">
          {actionIcon ?? icon}
          {action}
        </span>
      </div>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        aria-label={action}
        tabIndex={-1}
        onChange={(event) => {
          const files = event.target.files ? Array.from(event.target.files) : []
          if (files.length > 0) onFiles(files)
          event.target.value = ''
        }}
      />
    </div>
  )
}
