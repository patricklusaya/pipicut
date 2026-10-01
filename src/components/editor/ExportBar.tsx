import { useExport } from '@/store/exportStore.ts'

export function ExportBar() {
  const phase = useExport((state) => state.phase)
  const progress = useExport((state) => state.progress)
  const message = useExport((state) => state.message)
  const detail = useExport((state) => state.detail)
  const error = useExport((state) => state.error)
  const url = useExport((state) => state.url)
  const filename = useExport((state) => state.filename)
  const cancel = useExport((state) => state.cancel)
  const reset = useExport((state) => state.reset)

  if (phase === 'idle') return null

  return (
    <div className="shrink-0 border-b border-line bg-panel px-3 py-2">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-[12px]">
          {phase === 'error' ? error : message}
        </p>
        {phase === 'running' ? <span className="tabular-nums text-[12px] text-muted">{detail}</span> : null}
        {phase === 'running' ? (
          <button type="button" className="text-[12px] text-muted hover:text-text" onClick={cancel}>
            Cancel
          </button>
        ) : null}
        {phase === 'done' && url ? (
          <a className="text-[12px] text-accent" href={url} download={filename}>
            Save MP4
          </a>
        ) : null}
        {phase !== 'running' ? (
          <button type="button" className="text-[12px] text-muted hover:text-text" onClick={reset}>
            Dismiss
          </button>
        ) : null}
      </div>
      {phase === 'running' || phase === 'done' ? (
        <div className="mt-2 h-1 bg-line" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      ) : null}
      {phase === 'running' ? (
        <p className="mt-1 text-[11px] text-faint">
          Rendering on this device. {Math.round(progress * 100)}%
        </p>
      ) : null}
    </div>
  )
}
