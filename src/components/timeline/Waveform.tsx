import { useEffect, useRef, useState } from 'react'
import { cachedPeaks, drawWaveform, loadPeaks } from '@/lib/waveform.ts'
import { useProject } from '@/store/projectStore.ts'

export function Waveform({
  scrollLeft,
  viewWidth,
  pixelsPerSecond,
}: {
  scrollLeft: number
  viewWidth: number
  pixelsPerSecond: number
}) {
  const audio = useProject((state) => state.audio)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [revision, setRevision] = useState(0)
  const [failedId, setFailedId] = useState<string | null>(null)

  useEffect(() => {
    if (!audio) return
    let cancelled = false
    void loadPeaks(audio.id, audio.file).then((peaks) => {
      if (cancelled) return
      if (peaks) {
        setFailedId(null)
        setRevision((value) => value + 1)
      } else {
        setFailedId(audio.id)
      }
    })
    return () => {
      cancelled = true
    }
  }, [audio])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !audio) return
    const peaks = cachedPeaks(audio.id)
    if (!peaks) return
    drawWaveform(
      canvas,
      peaks,
      scrollLeft / pixelsPerSecond,
      (scrollLeft + viewWidth) / pixelsPerSecond,
    )
  }, [audio, scrollLeft, viewWidth, pixelsPerSecond, revision])

  return (
    <div className="relative h-[72px] border-b border-line">
      {audio ? (
        <canvas ref={canvasRef} className="sticky left-0 block h-full" style={{ width: viewWidth }} />
      ) : (
        <p className="sticky left-3 top-0 flex h-full items-center text-[11px] text-faint">
          No voiceover
        </p>
      )}
      {audio && !cachedPeaks(audio.id) ? (
        <p className="pointer-events-none absolute top-2 left-3 text-[11px] text-faint">
          {failedId === audio.id ? 'Waveform could not be read.' : 'Reading waveform…'}
        </p>
      ) : null}
    </div>
  )
}
