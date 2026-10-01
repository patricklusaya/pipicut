export const PEAKS_PER_SECOND = 80

const cache = new Map<string, Float32Array>()
const pending = new Map<string, Promise<Float32Array | null>>()

export function cachedPeaks(id: string): Float32Array | null {
  return cache.get(id) ?? null
}

export function dropPeaks(id: string): void {
  cache.delete(id)
  pending.delete(id)
}

export function loadPeaks(id: string, file: Blob): Promise<Float32Array | null> {
  const cached = cache.get(id)
  if (cached) return Promise.resolve(cached)
  const existing = pending.get(id)
  if (existing) return existing
  const job = computePeaks(file)
    .then((peaks) => {
      cache.set(id, peaks)
      pending.delete(id)
      return peaks
    })
    .catch(() => {
      pending.delete(id)
      return null
    })
  pending.set(id, job)
  return job
}

async function computePeaks(file: Blob): Promise<Float32Array> {
  const context = new AudioContext()
  try {
    const encoded = await file.arrayBuffer()
    if (context.state === 'suspended') await context.resume()
    const audio = await context.decodeAudioData(encoded.slice(0))
    const buckets = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND))
    const peaks = new Float32Array(buckets * 2)
    const channels: Float32Array[] = []
    for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
      channels.push(audio.getChannelData(channel))
    }
    const samplesPerBucket = audio.length / buckets
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const start = Math.floor(bucket * samplesPerBucket)
      const end = Math.min(audio.length, Math.floor((bucket + 1) * samplesPerBucket))
      let min = 0
      let max = 0
      for (let sample = start; sample < end; sample += 4) {
        let value = 0
        for (const channel of channels) value += channel[sample] ?? 0
        value /= channels.length || 1
        if (value < min) min = value
        if (value > max) max = value
      }
      peaks[bucket * 2] = min
      peaks[bucket * 2 + 1] = max
      if (bucket % 400 === 0) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, 0)
        })
      }
    }
    return peaks
  } finally {
    await context.close()
  }
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  viewStart: number,
  viewEnd: number,
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return
  const ratio = window.devicePixelRatio || 1
  const pixelWidth = Math.floor(width * ratio)
  const pixelHeight = Math.floor(height * ratio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)
  context.fillStyle = '#8ea0b5'
  const mid = height / 2
  const span = Math.max(0.001, viewEnd - viewStart)
  for (let x = 0; x < width; x += 1) {
    const time = viewStart + (x / width) * span
    const bucket = Math.floor(time * PEAKS_PER_SECOND)
    if (bucket < 0 || bucket * 2 + 1 >= peaks.length) continue
    const min = peaks[bucket * 2] ?? 0
    const max = peaks[bucket * 2 + 1] ?? 0
    const top = mid + min * (mid - 1)
    const bottom = mid + max * (mid - 1)
    context.fillRect(x, top, 1, Math.max(1, bottom - top))
  }
}
