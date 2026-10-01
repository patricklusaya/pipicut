import { create } from 'zustand'
import { clearStoredProject, loadProject } from '@/lib/db.ts'
import { engine } from '@/lib/engine.ts'
import { fileKind, mapPool, probeAudio, probeImage, probeVideo } from '@/lib/media.ts'
import { parseTimestamp } from '@/lib/timestamp.ts'
import {
  assignDurations,
  makeClip,
} from '@/lib/timeline.ts'
import { dropPeaks } from '@/lib/waveform.ts'
import type {
  AspectRatio,
  AudioAsset,
  Clip,
  ExportQuality,
  ProjectSnapshot,
  UnassignedAsset,
  ZoomDirection,
} from '@/types/project.ts'
import type { VisualEffect } from '@/lib/effects.ts'
import { usePlayback } from '@/store/playbackStore.ts'

const HISTORY_LIMIT = 50

type HistoryMode = 'push' | 'merge' | 'skip'

interface ProjectState extends ProjectSnapshot {
  ready: boolean
  importing: boolean
  importError: string | null
  storageNote: string | null
  past: ProjectSnapshot[]
  future: ProjectSnapshot[]
  gesturing: boolean
  hydrate: () => Promise<void>
  importFiles: (files: File[]) => Promise<void>
  updateClip: (id: string, patch: Partial<Clip>, mode?: HistoryMode) => void
  beginGesture: () => void
  endGesture: () => void
  deleteClip: (id: string) => void
  placeUnassigned: (id: string, startTime: number) => void
  removeUnassigned: (id: string) => void
  setVoiceoverVolume: (volume: number) => void
  setVideoMix: (volume: number) => void
  setAspect: (aspect: AspectRatio) => void
  setFps: (fps: 24 | 30) => void
  setQuality: (quality: ExportQuality) => void
  setZoomDepth: (zoomDepth: number) => void
  setZoomDirection: (zoomDirection: ZoomDirection) => void
  setCrossfade: (crossfade: number) => void
  setEffect: (effect: VisualEffect) => void
  setName: (name: string) => void
  editing: boolean
  openTimeline: () => void
  undo: () => void
  redo: () => void
  newProject: () => void
  setStorageNote: (note: string | null) => void
}

let coalesceOpen = false
let coalesceTimer = 0
let hydrateStarted = false

function snapshotOf(state: ProjectSnapshot): ProjectSnapshot {
  return {
    name: state.name,
    audio: state.audio,
    clips: state.clips.map((clip) => ({ ...clip })),
    unassigned: state.unassigned.map((asset) => ({ ...asset })),
    voiceoverVolume: state.voiceoverVolume,
    videoMix: state.videoMix,
    aspect: state.aspect,
    fps: state.fps,
    quality: state.quality,
    zoomDepth: state.zoomDepth,
    zoomDirection: state.zoomDirection,
    crossfade: state.crossfade,
    effect: state.effect,
  }
}

function withHistory(state: ProjectState, mode: HistoryMode): Pick<ProjectState, 'past' | 'future'> {
  if (mode === 'skip' || state.gesturing) return { past: state.past, future: state.future }
  if (mode === 'merge' && coalesceOpen) return { past: state.past, future: state.future }
  if (mode === 'merge') {
    coalesceOpen = true
    window.clearTimeout(coalesceTimer)
    coalesceTimer = window.setTimeout(() => {
      coalesceOpen = false
    }, 400)
  }
  return {
    past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
    future: [],
  }
}

function emptyProject(): ProjectSnapshot {
  return {
    name: 'Untitled',
    audio: null,
    clips: [],
    unassigned: [],
    voiceoverVolume: 1,
    videoMix: 0.15,
    aspect: '16:9',
    fps: 30,
    quality: 'full',
    zoomDepth: 0,
    zoomDirection: 'in',
    crossfade: 0,
    effect: 'none',
  }
}

function rememberUrls(snapshot: ProjectSnapshot, urls: Set<string>): void {
  if (snapshot.audio) urls.add(snapshot.audio.url)
  for (const clip of snapshot.clips) {
    urls.add(clip.url)
    if (clip.thumbnailUrl) urls.add(clip.thumbnailUrl)
  }
  for (const asset of snapshot.unassigned) {
    if (asset.url) urls.add(asset.url)
    if (asset.thumbnailUrl) urls.add(asset.thumbnailUrl)
  }
}

function revokeUrls(urls: Set<string>): void {
  for (const url of urls) URL.revokeObjectURL(url)
}

export const useProject = create<ProjectState>((set, get) => ({
  ...emptyProject(),
  ready: false,
  importing: false,
  importError: null,
  storageNote: null,
  past: [],
  future: [],
  gesturing: false,
  editing: false,

  setStorageNote: (storageNote) => set({ storageNote }),
  openTimeline: () => set({ editing: true }),

  hydrate: async () => {
    if (hydrateStarted) return
    hydrateStarted = true
    try {
      const restored = await loadProject()
      if (restored) {
        set({
          name: restored.name,
          audio: restored.audio,
          clips: restored.clips,
          unassigned: restored.unassigned,
          voiceoverVolume: restored.voiceoverVolume,
          videoMix: restored.videoMix,
          aspect: restored.aspect,
          fps: restored.fps,
          quality: restored.quality,
          zoomDepth: restored.zoomDepth,
          zoomDirection: restored.zoomDirection,
          crossfade: restored.crossfade,
          effect: restored.effect,
          storageNote: restored.missingMedia
            ? 'Some files could not be restored. Import them again.'
            : null,
          ready: true,
          past: [],
          future: [],
        })
        void rebuildThumbnails()
        return
      }
    } catch {
      set({ storageNote: null, ready: true })
      return
    }
    set({ ready: true })
  },

  importFiles: async (files) => {
    if (files.length === 0 || get().importing) return
    set({ importing: true, importError: null })
    try {
      const outcomes = await mapPool(files, 2, async (file) => {
        const kind = fileKind(file)
        try {
          if (kind === 'audio') return { ok: true as const, kind, audio: await probeAudio(file) }
          if (kind === 'image') return { ok: true as const, kind, visual: await probeImage(file) }
          if (kind === 'video') return { ok: true as const, kind, visual: await probeVideo(file) }
          return {
            ok: false as const,
            file,
            reason: `“${file.name}” is not a supported file. Use MP3, WAV, PNG, JPG, WEBP, MP4, MOV, or WEBM.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            file,
            reason: error instanceof Error ? error.message : `Could not read “${file.name}”.`,
          }
        }
      })

      const state = get()
      let audio: AudioAsset | null = state.audio
      const unassigned: UnassignedAsset[] = [...state.unassigned]
      const incoming: Clip[] = []
      let usedAudio = false

      for (const outcome of outcomes) {
        if (!outcome.ok) {
          unassigned.push({
            id: crypto.randomUUID(),
            name: outcome.file.name,
            kind: fileKind(outcome.file),
            reason: outcome.reason,
            url: null,
            thumbnailUrl: null,
            file: outcome.file,
            mimeType: outcome.file.type,
            width: 0,
            height: 0,
            sourceDuration: null,
          })
          continue
        }
        if (outcome.kind === 'audio') {
          if (usedAudio) {
            URL.revokeObjectURL(outcome.audio.url)
            unassigned.push({
              id: crypto.randomUUID(),
              name: outcome.audio.file.name,
              kind: 'audio',
              reason: `“${outcome.audio.file.name}” was not used. Pipicut keeps one voiceover.`,
              url: null,
              thumbnailUrl: null,
              file: outcome.audio.file,
              mimeType: outcome.audio.file.type,
              width: 0,
              height: 0,
              sourceDuration: outcome.audio.duration,
            })
            continue
          }
          usedAudio = true
          if (audio) dropPeaks(audio.id)
          audio = {
            id: crypto.randomUUID(),
            name: outcome.audio.file.name,
            mimeType: outcome.audio.file.type || 'audio/wav',
            duration: outcome.audio.duration,
            url: outcome.audio.url,
            file: outcome.audio.file,
          }
          continue
        }

        const visual = outcome.visual
        const timestamp = parseTimestamp(visual.file.name)
        if (timestamp == null) {
          unassigned.push({
            id: crypto.randomUUID(),
            name: visual.file.name,
            kind: visual.kind,
            reason: `“${visual.file.name}” has no timestamp. Name it like 0-03.png, or place it manually.`,
            url: visual.url,
            thumbnailUrl: visual.thumbnailUrl,
            file: visual.file,
            mimeType: visual.file.type,
            width: visual.width,
            height: visual.height,
            sourceDuration: visual.duration,
          })
          continue
        }
        incoming.push(
          makeClip({
            id: crypto.randomUUID(),
            type: visual.kind,
            name: visual.file.name,
            mimeType: visual.file.type || (visual.kind === 'image' ? 'image/png' : 'video/mp4'),
            url: visual.url,
            thumbnailUrl: visual.thumbnailUrl,
            file: visual.file,
            startTime: timestamp,
            sourceDuration: visual.duration,
            width: visual.width,
            height: visual.height,
          }),
        )
      }

      const clips = assignDurations([...state.clips, ...incoming], audio?.duration ?? null)
      set({
        audio,
        clips,
        unassigned,
        importing: false,
        past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
        future: [],
        gesturing: false,
      })
    } catch (error) {
      set({
        importing: false,
        importError: error instanceof Error ? error.message : 'Those files could not be imported.',
      })
    }
  },

  updateClip: (id, patch, mode = 'push') => {
    const state = get()
    set({
      ...withHistory(state, mode),
      clips: state.clips.map((clip) => (clip.id === id ? { ...clip, ...patch } : clip)),
    })
  },

  beginGesture: () => {
    const state = get()
    if (state.gesturing) return
    set({
      gesturing: true,
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: [],
    })
  },

  endGesture: () => set({ gesturing: false }),

  deleteClip: (id) => {
    const state = get()
    set({
      ...withHistory(state, 'push'),
      clips: assignDurations(
        state.clips.filter((clip) => clip.id !== id),
        state.audio?.duration ?? null,
      ),
      gesturing: false,
    })
    if (usePlayback.getState().selectedClipId === id) usePlayback.getState().select(null)
  },

  placeUnassigned: (id, startTime) => {
    const state = get()
    const asset = state.unassigned.find((item) => item.id === id)
    if (!asset?.file || !asset.url || (asset.kind !== 'image' && asset.kind !== 'video')) return
    const clip = makeClip({
      id: asset.id,
      type: asset.kind,
      name: asset.name,
      mimeType: asset.mimeType,
      url: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      file: asset.file,
      startTime,
      sourceDuration: asset.sourceDuration,
      width: asset.width,
      height: asset.height,
    })
    set({
      ...withHistory(state, 'push'),
      unassigned: state.unassigned.filter((item) => item.id !== id),
      clips: assignDurations([...state.clips, clip], state.audio?.duration ?? null),
    })
  },

  removeUnassigned: (id) => {
    const state = get()
    set({
      ...withHistory(state, 'push'),
      unassigned: state.unassigned.filter((item) => item.id !== id),
    })
  },

  setVoiceoverVolume: (voiceoverVolume) => {
    const state = get()
    set({ ...withHistory(state, 'merge'), voiceoverVolume })
  },

  setVideoMix: (videoMix) => {
    const state = get()
    set({ ...withHistory(state, 'merge'), videoMix })
  },

  setAspect: (aspect) => set({ aspect }),
  setFps: (fps) => set({ fps }),
  setQuality: (quality) => set({ quality }),
  setZoomDepth: (zoomDepth) => set({ zoomDepth }),
  setZoomDirection: (zoomDirection) => set({ zoomDirection }),
  setCrossfade: (crossfade) => set({ crossfade }),
  setEffect: (effect) => set({ effect }),

  setName: (name) => set({ name }),

  undo: () => {
    const state = get()
    const previous = state.past[state.past.length - 1]
    if (!previous) return
    coalesceOpen = false
    set({
      ...previous,
      past: state.past.slice(0, -1),
      future: [snapshotOf(state), ...state.future].slice(0, HISTORY_LIMIT),
      gesturing: false,
    })
    if (usePlayback.getState().selectedClipId) {
      const selected = usePlayback.getState().selectedClipId
      if (selected && !previous.clips.some((clip) => clip.id === selected)) {
        usePlayback.getState().select(null)
      }
    }
  },

  redo: () => {
    const state = get()
    const next = state.future[0]
    if (!next) return
    coalesceOpen = false
    set({
      ...next,
      past: [...state.past, snapshotOf(state)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      gesturing: false,
    })
  },

  newProject: () => {
    const state = get()
    const urls = new Set<string>()
    rememberUrls(state, urls)
    for (const item of state.past) rememberUrls(item, urls)
    for (const item of state.future) rememberUrls(item, urls)
    revokeUrls(urls)
    if (state.audio) dropPeaks(state.audio.id)
    coalesceOpen = false
    engine.stop()
    engine.setAudio(null, 0)
    usePlayback.getState().select(null)
    set({
      ...emptyProject(),
      ready: true,
      importing: false,
      importError: null,
      storageNote: null,
      past: [],
      future: [],
      gesturing: false,
      editing: false,
    })
    void clearStoredProject()
  },
}))

async function rebuildThumbnails(): Promise<void> {
  const clips = useProject.getState().clips.filter((clip) => !clip.thumbnailUrl)
  await mapPool(clips, 2, async (clip) => {
    try {
      const file = new File([clip.file], clip.name, { type: clip.mimeType })
      const probed = clip.type === 'image' ? await probeImage(file) : await probeVideo(file)
      URL.revokeObjectURL(probed.url)
      const current = useProject.getState().clips.find((item) => item.id === clip.id)
      if (!current) {
        if (probed.thumbnailUrl) URL.revokeObjectURL(probed.thumbnailUrl)
        return
      }
      useProject.getState().updateClip(clip.id, { thumbnailUrl: probed.thumbnailUrl }, 'skip')
    } catch {
      // The full file can still be previewed without a timeline thumbnail.
    }
  })
}

