import { useState } from 'react'
import { parseUserTime } from '@/lib/format.ts'
import { deriveNotices } from '@/lib/timeline.ts'
import { usePlayback } from '@/store/playbackStore.ts'
import { useProject } from '@/store/projectStore.ts'

export function IssuesBar() {
  const clips = useProject((state) => state.clips)
  const unassigned = useProject((state) => state.unassigned)
  const notices = deriveNotices(clips, unassigned)
  if (notices.length === 0) return null

  return (
    <div className="max-h-28 shrink-0 overflow-auto border-t border-line bg-panel">
      <ul>
        {notices.map((notice) => (
          <li key={notice.id} className="border-b border-line px-3 py-1.5 last:border-b-0">
            {notice.unassignedId ? (
              <UnassignedRow id={notice.unassignedId} message={notice.message} />
            ) : (
              <div className="flex items-center gap-3">
                <p className={notice.tone === 'warning' ? 'text-[12px] text-warn' : 'text-[12px] text-muted'}>
                  {notice.message}
                </p>
                {notice.clipId && notice.id.startsWith('duplicate-') ? (
                  <button
                    type="button"
                    className="text-[12px] text-accent"
                    onClick={() => useProject.getState().deleteClip(notice.clipId ?? '')}
                  >
                    Remove extra
                  </button>
                ) : notice.clipId ? (
                  <button
                    type="button"
                    className="text-[12px] text-accent"
                    onClick={() => usePlayback.getState().select(notice.clipId ?? null)}
                  >
                    Select
                  </button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function UnassignedRow({ id, message }: { id: string; message: string }) {
  const asset = useProject((state) => state.unassigned.find((item) => item.id === id))
  const placeUnassigned = useProject((state) => state.placeUnassigned)
  const removeUnassigned = useProject((state) => state.removeUnassigned)
  const [value, setValue] = useState('0:00')
  const [invalid, setInvalid] = useState(false)
  if (!asset) return null
  const canPlace = asset.kind === 'image' || asset.kind === 'video'

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const time = parseUserTime(value)
        if (time == null) {
          setInvalid(true)
          return
        }
        placeUnassigned(id, time)
      }}
    >
      <p className="min-w-0 flex-1 text-[12px] text-warn">{message}</p>
      {canPlace ? (
        <>
          <input
            aria-label={`Start time for ${asset.name}`}
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              setInvalid(false)
            }}
            className="h-6 w-16 border border-line bg-bg px-1 text-[12px] tabular-nums"
          />
          <button type="submit" className="text-[12px] text-accent">
            Place
          </button>
        </>
      ) : null}
      {invalid ? <span className="text-[11px] text-danger">Use 0:03 or 1-15</span> : null}
      <button type="button" className="text-[12px] text-muted hover:text-text" onClick={() => removeUnassigned(id)}>
        Remove
      </button>
    </form>
  )
}
