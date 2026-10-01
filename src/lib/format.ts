export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function formatPrecise(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const tenth = Math.floor((seconds % 1) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenth}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0.0s'
  const rounded = Math.round(seconds * 10) / 10
  return `${rounded.toFixed(1)}s`
}

/** Accepts 75, 1:15, or 1-15. */
export function parseUserTime(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const clock = /^(\d+):(\d{1,2})(?:\.(\d+))?$/.exec(trimmed)
  if (clock) {
    const seconds = Number(clock[2])
    if (seconds > 59) return null
    const fraction = clock[3] ? Number(`0.${clock[3]}`) : 0
    return Number(clock[1]) * 60 + seconds + fraction
  }
  const dashed = /^(\d+)-(\d{1,2})$/.exec(trimmed)
  if (dashed) {
    const seconds = Number(dashed[2])
    if (seconds > 59) return null
    return Number(dashed[1]) * 60 + seconds
  }
  const value = Number(trimmed)
  if (Number.isFinite(value) && value >= 0) return value
  return null
}

export function rulerStep(pixelsPerSecond: number): number {
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600, 7200]
  for (const step of steps) {
    if (step * pixelsPerSecond >= 72) return step
  }
  return 7200
}
