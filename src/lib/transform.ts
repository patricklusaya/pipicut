import type { AspectRatio, ExportQuality, FitMode, ZoomDirection } from '../types/project.ts'

export const FRAME_WIDTH = 1920
export const FRAME_HEIGHT = 1080

export function outputSize(aspect: AspectRatio, quality: ExportQuality): { width: number; height: number } {
  if (aspect === '9:16') {
    return quality === 'draft' ? { width: 720, height: 1280 } : { width: 1080, height: 1920 }
  }
  return quality === 'draft' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 }
}

/** Extra scale at a moment inside a clip. Depth 0.08 is an 8% move. */
export function kenBurnsScale(
  progress: number,
  depth: number,
  direction: ZoomDirection,
  baseScale = 1,
): number {
  const amount = Number.isFinite(depth) ? Math.max(0, depth) : 0
  const along = Math.min(1, Math.max(0, progress))
  const extra = direction === 'out' ? 1 - along : along
  const base = Number.isFinite(baseScale) && baseScale > 0 ? baseScale : 1
  return base * (1 + amount * extra)
}

export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

/** Shared placement for the preview and the local export. */
export function frameRect(
  sourceWidth: number,
  sourceHeight: number,
  fit: FitMode,
  scale: number,
  positionX: number,
  positionY: number,
  frameWidth = FRAME_WIDTH,
  frameHeight = FRAME_HEIGHT,
): FrameRect {
  const srcW = sourceWidth > 0 ? sourceWidth : frameWidth
  const srcH = sourceHeight > 0 ? sourceHeight : frameHeight
  const srcAspect = srcW / srcH
  const frameAspect = frameWidth / frameHeight
  const widerThanFrame = srcAspect > frameAspect
  const cover = fit === 'fill'
  let drawW: number
  let drawH: number
  if (cover ? widerThanFrame : !widerThanFrame) {
    drawH = frameHeight
    drawW = frameHeight * srcAspect
  } else {
    drawW = frameWidth
    drawH = frameWidth / srcAspect
  }
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  drawW *= safeScale
  drawH *= safeScale
  const x = (frameWidth - drawW) / 2 + (positionX / 100) * frameWidth
  const y = (frameHeight - drawH) / 2 + (positionY / 100) * frameHeight
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: even(drawW),
    height: even(drawH),
  }
}

export function mediaTransform(positionX: number, positionY: number, scale: number): string {
  return `translate(${positionX}%, ${positionY}%) scale(${scale})`
}

export function fadeOpacity(
  time: number,
  start: number,
  duration: number,
  fadeIn: number,
  fadeOut: number,
): number {
  const local = time - start
  let opacity = 1
  if (fadeIn > 0 && local < fadeIn) opacity = Math.min(opacity, local / fadeIn)
  if (fadeOut > 0 && local > duration - fadeOut) {
    opacity = Math.min(opacity, (duration - local) / fadeOut)
  }
  if (local < 0 || local > duration) return 0
  return Math.min(1, Math.max(0, opacity))
}
