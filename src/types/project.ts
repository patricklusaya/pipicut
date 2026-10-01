import type { VisualEffect } from '../lib/effects.ts'

export type FitMode = 'fit' | 'fill'

export type ClipType = 'image' | 'video'

export interface AudioAsset {
  id: string
  name: string
  mimeType: string
  duration: number
  url: string
  file: Blob
}

export interface Clip {
  id: string
  type: ClipType
  name: string
  mimeType: string
  url: string
  thumbnailUrl: string | null
  file: Blob
  startTime: number
  duration: number
  trimStart: number
  sourceDuration: number | null
  width: number
  height: number
  scale: number
  positionX: number
  positionY: number
  fit: FitMode
  volume: number
  muted: boolean
  fadeIn: number
  fadeOut: number
  /** When true, duration still follows the next timestamp or the voiceover end. */
  auto: boolean
}

export interface UnassignedAsset {
  id: string
  name: string
  kind: 'image' | 'video' | 'audio' | 'unknown'
  reason: string
  url: string | null
  thumbnailUrl: string | null
  file: Blob | null
  mimeType: string
  width: number
  height: number
  sourceDuration: number | null
}

export interface Notice {
  id: string
  tone: 'warning' | 'info'
  message: string
  clipId?: string
  unassignedId?: string
}

export type AspectRatio = '16:9' | '9:16'
export type ExportQuality = 'draft' | 'full'
export type ZoomDirection = 'in' | 'out'
export type { VisualEffect } from '../lib/effects.ts'

export interface ProjectSnapshot {
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
}
