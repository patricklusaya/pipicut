import type {
  AspectRatio,
  AudioAsset,
  Clip,
  ExportQuality,
  UnassignedAsset,
  ZoomDirection,
} from '../types/project.ts'
import { isVisualEffect, type VisualEffect } from './effects.ts'

const DB_NAME = 'framesync'
const DB_VERSION = 1

interface SavedAudio {
  id: string
  name: string
  mimeType: string
  duration: number
}

interface SavedClip {
  id: string
  type: Clip['type']
  name: string
  mimeType: string
  startTime: number
  duration: number
  trimStart: number
  sourceDuration: number | null
  width: number
  height: number
  scale: number
  positionX: number
  positionY: number
  fit: Clip['fit']
  volume: number
  muted: boolean
  fadeIn: number
  fadeOut: number
  auto: boolean
}

interface SavedUnassigned {
  id: string
  name: string
  kind: UnassignedAsset['kind']
  reason: string
  mimeType: string
  width: number
  height: number
  sourceDuration: number | null
}

interface SavedProject {
  name: string
  audio: SavedAudio | null
  voiceoverVolume: number
  videoMix: number
  aspect?: AspectRatio
  fps?: 24 | 30
  quality?: ExportQuality
  zoomDepth?: number
  zoomDirection?: ZoomDirection
  crossfade?: number
  effect?: VisualEffect
  clips: SavedClip[]
  unassigned: SavedUnassigned[]
}

interface StoredAsset {
  blob: Blob
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

export async function saveProject(
  name: string,
  audio: AudioAsset | null,
  clips: Clip[],
  unassigned: UnassignedAsset[],
  voiceoverVolume: number,
  videoMix: number,
  look: {
    aspect: AspectRatio
    fps: 24 | 30
    quality: ExportQuality
    zoomDepth: number
    zoomDirection: ZoomDirection
    crossfade: number
    effect: VisualEffect
  },
): Promise<'saved' | 'session'> {
  const db = await openDb()
  const saved: SavedProject = {
    name,
    audio: audio
      ? { id: audio.id, name: audio.name, mimeType: audio.mimeType, duration: audio.duration }
      : null,
    voiceoverVolume,
    videoMix,
    aspect: look.aspect,
    fps: look.fps,
    quality: look.quality,
    zoomDepth: look.zoomDepth,
    zoomDirection: look.zoomDirection,
    crossfade: look.crossfade,
    effect: look.effect,
    clips: clips.map((clip) => ({
      id: clip.id,
      type: clip.type,
      name: clip.name,
      mimeType: clip.mimeType,
      startTime: clip.startTime,
      duration: clip.duration,
      trimStart: clip.trimStart,
      sourceDuration: clip.sourceDuration,
      width: clip.width,
      height: clip.height,
      scale: clip.scale,
      positionX: clip.positionX,
      positionY: clip.positionY,
      fit: clip.fit,
      volume: clip.volume,
      muted: clip.muted,
      fadeIn: clip.fadeIn,
      fadeOut: clip.fadeOut,
      auto: clip.auto,
    })),
    unassigned: unassigned
      .filter((asset) => asset.file)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        reason: asset.reason,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        sourceDuration: asset.sourceDuration,
      })),
  }

  const blobs = new Map<string, Blob>()
  if (audio) blobs.set(audio.id, audio.file)
  for (const clip of clips) blobs.set(clip.id, clip.file)
  for (const asset of unassigned) {
    if (asset.file) blobs.set(asset.id, asset.file)
  }

  try {
    const transaction = db.transaction(['meta', 'assets'], 'readwrite')
    transaction.objectStore('meta').put(saved, 'current')
    const store = transaction.objectStore('assets')
    store.clear()
    for (const [id, blob] of blobs) store.put({ blob } satisfies StoredAsset, id)
    await transactionDone(transaction)
    return 'saved'
  } catch {
    return 'session'
  } finally {
    db.close()
  }
}

export interface RestoredProject {
  name: string
  audio: AudioAsset | null
  clips: Clip[]
  unassigned: UnassignedAsset[]
  voiceoverVolume: number
  videoMix: number
  aspect: AspectRatio
  fps: 24 | 30
  quality: ExportQuality
  zoomDepth: number
  zoomDirection: ZoomDirection
  crossfade: number
  effect: VisualEffect
  missingMedia: boolean
}

export async function loadProject(): Promise<RestoredProject | null> {
  const db = await openDb()
  try {
    const metaRequest = db.transaction('meta', 'readonly').objectStore('meta').get('current')
    const saved = await new Promise<SavedProject | undefined>((resolve, reject) => {
      metaRequest.onsuccess = () => resolve(metaRequest.result as SavedProject | undefined)
      metaRequest.onerror = () => reject(metaRequest.error)
    })
    if (!saved?.clips) return null

    const ids = [
      ...(saved.audio ? [saved.audio.id] : []),
      ...saved.clips.map((clip) => clip.id),
      ...saved.unassigned.map((asset) => asset.id),
    ]
    const assetStore = db.transaction('assets', 'readonly').objectStore('assets')
    const blobs = new Map<string, Blob>()
    await Promise.all(
      ids.map(
        (id) =>
          new Promise<void>((resolve) => {
            const request = assetStore.get(id)
            request.onsuccess = () => {
              const stored = request.result as StoredAsset | undefined
              if (stored?.blob) blobs.set(id, stored.blob)
              resolve()
            }
            request.onerror = () => resolve()
          }),
      ),
    )

    let missingMedia = false
    let audio: AudioAsset | null = null
    if (saved.audio) {
      const blob = blobs.get(saved.audio.id)
      if (blob) {
        audio = {
          ...saved.audio,
          url: URL.createObjectURL(blob),
          file: blob,
        }
      } else {
        missingMedia = true
      }
    }

    const clips: Clip[] = []
    for (const clip of saved.clips) {
      const blob = blobs.get(clip.id)
      if (!blob) {
        missingMedia = true
        continue
      }
      clips.push({
        ...clip,
        url: URL.createObjectURL(blob),
        thumbnailUrl: null,
        file: blob,
      })
    }

    const unassigned: UnassignedAsset[] = []
    for (const asset of saved.unassigned) {
      const blob = blobs.get(asset.id)
      if (!blob) {
        missingMedia = true
        continue
      }
      unassigned.push({
        ...asset,
        url: URL.createObjectURL(blob),
        thumbnailUrl: null,
        file: blob,
      })
    }

    if (!audio && clips.length === 0 && unassigned.length === 0) return null
    return {
      name: saved.name || 'Untitled',
      audio,
      clips,
      unassigned,
      voiceoverVolume: saved.voiceoverVolume ?? 1,
      videoMix: saved.videoMix ?? 0.15,
      aspect: saved.aspect === '9:16' ? '9:16' : '16:9',
      fps: saved.fps === 24 ? 24 : 30,
      quality: saved.quality === 'draft' ? 'draft' : 'full',
      zoomDepth: typeof saved.zoomDepth === 'number' ? saved.zoomDepth : 0.08,
      zoomDirection: saved.zoomDirection === 'out' ? 'out' : 'in',
      crossfade: typeof saved.crossfade === 'number' ? saved.crossfade : 0.35,
      effect: isVisualEffect(saved.effect) ? saved.effect : 'none',
      missingMedia,
    }
  } finally {
    db.close()
  }
}

export async function clearStoredProject(): Promise<void> {
  const db = await openDb()
  try {
    const transaction = db.transaction(['meta', 'assets'], 'readwrite')
    transaction.objectStore('meta').delete('current')
    transaction.objectStore('assets').clear()
    await transactionDone(transaction)
  } finally {
    db.close()
  }
}
