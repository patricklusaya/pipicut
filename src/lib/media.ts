export type FileKind = 'audio' | 'image' | 'video' | 'unknown'

export const AUDIO_ACCEPT = 'audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a'
export const VISUAL_ACCEPT =
  'image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm'

const EXTENSIONS: Record<string, FileKind> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
}

export function fileKind(file: File): FileKind {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (EXTENSIONS[extension]) return EXTENSIONS[extension]
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'unknown'
}

export function fileExtension(name: string, fallback: string): string {
  const extension = name.split('.').pop()?.toLowerCase()
  if (!extension || !/^[a-z0-9]{1,5}$/.test(extension)) return fallback
  return extension
}

function waitFor(target: EventTarget, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('timeout'))
    }, timeoutMs)
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('unreadable'))
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      target.removeEventListener(event, onReady)
      target.removeEventListener('error', onError)
    }
    target.addEventListener(event, onReady)
    target.addEventListener('error', onError)
  })
}

export interface ProbedAudio {
  kind: 'audio'
  file: File
  duration: number
  url: string
}

export async function probeAudio(file: File): Promise<ProbedAudio> {
  const url = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url
  try {
    await waitFor(audio, 'loadedmetadata', 8000)
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
      throw new Error('duration')
    }
    return { kind: 'audio', file, duration: audio.duration, url }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(`Could not read “${file.name}”. Use MP3, WAV, or M4A.`)
  }
}

async function canvasThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string | null> {
  const canvas = document.createElement('canvas')
  const maxWidth = 160
  const scale = width > 0 ? maxWidth / width : 1
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) return null
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.72)
  })
  if (!blob) return null
  return URL.createObjectURL(blob)
}

export interface ProbedVisual {
  kind: 'image' | 'video'
  file: File
  url: string
  thumbnailUrl: string | null
  width: number
  height: number
  duration: number | null
}

export async function probeImage(file: File): Promise<ProbedVisual> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await waitFor(image, 'load', 8000)
    const thumbnailUrl = await canvasThumbnail(image, image.naturalWidth, image.naturalHeight)
    return {
      kind: 'image',
      file,
      url,
      thumbnailUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      duration: null,
    }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(`Could not read “${file.name}”. Use PNG, JPG, or WEBP.`)
  }
}

export async function probeVideo(file: File): Promise<ProbedVisual> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none'
  host.appendChild(video)
  document.body.appendChild(host)
  try {
    await waitFor(video, 'loadedmetadata', 10000)
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('duration')
    }
    const stamp = Math.min(0.15, video.duration / 2)
    if (video.readyState < 2) {
      try {
        await waitFor(video, 'loadeddata', 4000)
      } catch {
        // A thumbnail is optional. Metadata is enough to place the clip.
      }
    }
    try {
      video.currentTime = stamp
      await waitFor(video, 'seeked', 4000)
    } catch {
      // Some codecs cannot seek until export. Keep the file anyway.
    }
    const thumbnailUrl = await canvasThumbnail(
      video,
      video.videoWidth || 16,
      video.videoHeight || 9,
    )
    return {
      kind: 'video',
      file,
      url,
      thumbnailUrl,
      width: video.videoWidth,
      height: video.videoHeight,
      duration: video.duration,
    }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(
      `Could not read “${file.name}”. Try MP4 (H.264) or another browser-compatible video.`,
    )
  } finally {
    video.src = ''
    host.remove()
  }
}

export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}
