import { create } from 'zustand'
import { formatClock } from '@/lib/format.ts'
import { engine } from '@/lib/engine.ts'
import { renderTimeline, resetEncoder } from '@/lib/render.ts'
import { exportSpan, projectDuration } from '@/lib/timeline.ts'
import { useProject } from '@/store/projectStore.ts'

interface ExportState {
  phase: 'idle' | 'running' | 'done' | 'error'
  progress: number
  message: string
  detail: string
  error: string | null
  url: string | null
  filename: string
  start: () => void
  cancel: () => void
  reset: () => void
}

let abortController: AbortController | null = null
let lastPaint = 0

function filenameFor(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'pipicut'}.mp4`
}

function saveDownload(url: string, filename: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export const useExport = create<ExportState>((set, get) => ({
  phase: 'idle',
  progress: 0,
  message: '',
  detail: '',
  error: null,
  url: null,
  filename: 'pipicut.mp4',
  start: () => {
    const project = useProject.getState()
    const duration = exportSpan(
      project.audio?.duration ?? null,
      projectDuration(project.audio?.duration ?? null, project.clips),
    )
    if (duration < 0.1 || (!project.audio && project.clips.length === 0)) {
      set({
        phase: 'error',
        error: 'Add a voiceover or a visual before exporting.',
        message: '',
        progress: 0,
      })
      return
    }
    if (get().phase === 'running') return
    const previous = get().url
    if (previous) URL.revokeObjectURL(previous)
    abortController?.abort()
    const controller = new AbortController()
    abortController = controller
    engine.pause()
    const filename = filenameFor(project.name)
    set({
      phase: 'running',
      progress: 0,
      message: 'Starting the local encoder…',
      detail: `00:00 / ${formatClock(duration)}`,
      error: null,
      url: null,
      filename,
    })
    void renderTimeline({
      audio: project.audio,
      clips: [...project.clips],
      voiceoverVolume: project.voiceoverVolume,
      videoMix: project.videoMix,
      duration,
      aspect: project.aspect,
      fps: project.fps,
      quality: project.quality,
      zoomDepth: project.zoomDepth,
      zoomDirection: project.zoomDirection,
      crossfade: project.crossfade,
      effect: project.effect,
      signal: controller.signal,
      onProgress: (progress) => {
        const now = performance.now()
        if (progress.progress < 1 && now - lastPaint < 120) return
        lastPaint = now
        set({
          progress: progress.progress,
          message: progress.message,
          detail: `${formatClock(progress.renderedSeconds)} / ${formatClock(progress.totalSeconds || duration)}`,
        })
      },
    })
      .then((blob) => {
        if (controller.signal.aborted) return
        const url = URL.createObjectURL(blob)
        saveDownload(url, filename)
        set({
          phase: 'done',
          progress: 1,
          message: 'Saved to your downloads',
          detail: formatClock(duration),
          url,
          filename,
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          set({ phase: 'idle', progress: 0, message: '', detail: '', error: null, url: null })
          return
        }
        set({
          phase: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'The video could not be rendered on this device. Nothing was uploaded.',
        })
      })
  },
  cancel: () => {
    abortController?.abort()
    resetEncoder()
    const url = get().url
    if (url) URL.revokeObjectURL(url)
    set({ phase: 'idle', progress: 0, message: '', detail: '', error: null, url: null })
  },
  reset: () => {
    const url = get().url
    if (url) URL.revokeObjectURL(url)
    set({ phase: 'idle', progress: 0, message: '', detail: '', error: null, url: null })
  },
}))
