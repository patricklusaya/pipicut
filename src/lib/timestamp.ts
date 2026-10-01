const STEM = /^(\d+)-(\d{1,2})$/

/**
 * Filenames are minute-second stamps.
 * 0-03 = 3s, 1-03 = 63s, 1-15 = 75s, 10-05 = 605s.
 * Seconds must be 0–59. Anything else is unassigned.
 */
export function parseTimestamp(filename: string): number | null {
  const base = filename.split(/[/\\]/).pop() ?? filename
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const match = STEM.exec(stem)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null
  if (seconds > 59) return null
  return minutes * 60 + seconds
}
