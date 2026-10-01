export function snapTime(time: number, points: number[], threshold: number): number {
  let best = time
  let bestDistance = threshold
  for (const point of points) {
    const distance = Math.abs(point - time)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

/** Snap either the start or the end of a clip, whichever lands closer. */
export function snapRange(
  start: number,
  duration: number,
  points: number[],
  threshold: number,
): number {
  const startSnap = snapTime(start, points, threshold)
  const endSnap = snapTime(start + duration, points, threshold)
  const startMoved = Math.abs(startSnap - start)
  const endMoved = Math.abs(endSnap - (start + duration))
  const startHit = startMoved > 0.0001
  const endHit = endMoved > 0.0001
  if (endHit && (!startHit || endMoved < startMoved)) return Math.max(0, endSnap - duration)
  if (startHit) return Math.max(0, startSnap)
  return Math.max(0, start)
}
