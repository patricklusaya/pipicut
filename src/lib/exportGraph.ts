import { effectChain, type VisualEffect } from './effects.ts'

/** Still images do not need 30 frames a second. Video clips keep the chosen rate. */
export function encodeFrameRate(input: {
  fps: number
  hasVideo: boolean
  zoomDepth: number
  crossfade: number
  effect: VisualEffect
}): number {
  if (input.hasVideo) return input.fps
  const moving =
    input.zoomDepth > 0.001 ||
    input.crossfade > 0.02 ||
    input.effect === 'snow' ||
    input.effect === 'grain'
  return moving ? 8 : 1
}
import type { FitMode, ZoomDirection } from '../types/project.ts'
import { frameRect } from './transform.ts'

export interface GraphOptions {
  width?: number
  height?: number
  fps?: number
  zoomDepth?: number
  zoomDirection?: ZoomDirection
  crossfade?: number
  effect?: VisualEffect
}

export interface GraphClip {
  type: 'image' | 'video'
  start: number
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
  hasAudio: boolean
  /** Image was already fitted to the output frame in the browser. */
  prepared?: boolean
  /** Seconds already elapsed in this image when a short export piece begins. */
  zoomOrigin?: number
  zoomSpan?: number
}

function num(value: number): string {
  return value.toFixed(3)
}

function playableDuration(clip: GraphClip): number {
  if (clip.type !== 'video' || clip.sourceDuration == null) return clip.duration
  return Math.min(clip.duration, Math.max(0.04, clip.sourceDuration - clip.trimStart))
}

function videoChain(
  clip: GraphClip,
  inputIndex: number,
  label: string,
  fps: number,
  fadeIn: number,
  fadeOut: number,
): string {
  const rect = frameRect(clip.width, clip.height, clip.fit, clip.scale, clip.positionX, clip.positionY)
  const playable = playableDuration(clip)
  const hold = Math.max(0, clip.duration - playable)
  const filters = [
    `trim=start=${num(clip.trimStart)}:duration=${num(playable)}`,
    'setpts=PTS-STARTPTS',
    hold > 0.001 ? `tpad=stop_mode=clone:stop_duration=${num(hold)}` : '',
    `scale=${rect.width}:${rect.height}:flags=bilinear`,
    `fps=${fps}`,
    fadeIn > 0.01 ? `fade=t=in:st=0:d=${num(fadeIn)}` : '',
    fadeOut > 0.01 ? `fade=t=out:st=${num(Math.max(0, clip.duration - fadeOut))}:d=${num(fadeOut)}` : '',
    'format=rgba',
    `setpts=PTS-STARTPTS+${num(clip.start)}/TB`,
  ].filter(Boolean)
  return `[${inputIndex}:v]${filters.join(',')}[${label}]`
}

export function zoomFrameSize(
  frameWidth: number,
  frameHeight: number,
  zoomDepth: number,
): { width: number; height: number } {
  if (zoomDepth <= 0.001) return { width: frameWidth, height: frameHeight }
  return {
    width: Math.max(frameWidth + 2, Math.round((frameWidth * (1 + zoomDepth)) / 2) * 2),
    height: Math.max(frameHeight + 2, Math.round((frameHeight * (1 + zoomDepth)) / 2) * 2),
  }
}

function imageChain(
  clip: GraphClip,
  inputIndex: number,
  label: string,
  frameWidth: number,
  frameHeight: number,
  fps: number,
  zoomDepth: number,
  zoomDirection: ZoomDirection,
  fadeIn: number,
): string {
  if (clip.prepared) {
    const filters = [`fps=${fps}`]
    if (zoomDepth > 0.001) {
      const grow = zoomFrameSize(frameWidth, frameHeight, zoomDepth)
      const spanW = grow.width - frameWidth
      const spanH = grow.height - frameHeight
      const origin = clip.zoomOrigin ?? 0
      const span = Math.max(0.1, clip.zoomSpan ?? clip.duration)
      const along = `(t+${origin.toFixed(3)})/${span.toFixed(3)}`
      const widthExpr =
        zoomDirection === 'out'
          ? `min(iw\\,max(2\\,trunc((${frameWidth}+${spanW}*${along})/2)*2))`
          : `min(iw\\,max(2\\,trunc((${grow.width}-${spanW}*${along})/2)*2))`
      const heightExpr =
        zoomDirection === 'out'
          ? `min(ih\\,max(2\\,trunc((${frameHeight}+${spanH}*${along})/2)*2))`
          : `min(ih\\,max(2\\,trunc((${grow.height}-${spanH}*${along})/2)*2))`
      filters.push(
        `crop=w='${widthExpr}':h='${heightExpr}':x='(in_w-out_w)/2':y='(in_h-out_h)/2'`,
        `scale=${frameWidth}:${frameHeight}:flags=bilinear`,
      )
    }
    if (fadeIn > 0.01) {
      filters.push(`fade=t=in:st=0:d=${num(Math.min(fadeIn, clip.duration))}:alpha=1`, 'format=yuva420p')
    } else {
      filters.push('format=yuv420p')
    }
    filters.push(`setpts=PTS-STARTPTS+${num(clip.start)}/TB`)
    return `[${inputIndex}:v]${filters.join(',')}[${label}]`
  }
  const zooming = zoomDepth > 0.001
  const placed = frameRect(
    clip.width,
    clip.height,
    clip.fit,
    clip.scale,
    clip.positionX,
    clip.positionY,
    frameWidth,
    frameHeight,
  )
  const growW = Math.max(frameWidth + 2, Math.round((frameWidth * (1 + zoomDepth)) / 2) * 2)
  const growH = Math.max(frameHeight + 2, Math.round((frameHeight * (1 + zoomDepth)) / 2) * 2)
  const spanW = growW - frameWidth
  const spanH = growH - frameHeight
  const dur = Math.max(0.1, clip.duration)
  const widthExpr =
    zoomDirection === 'out'
      ? `trunc((${frameWidth}+${spanW}*t/${dur.toFixed(3)})/2)*2`
      : `trunc((${growW}-${spanW}*t/${dur.toFixed(3)})/2)*2`
  const heightExpr =
    zoomDirection === 'out'
      ? `trunc((${frameHeight}+${spanH}*t/${dur.toFixed(3)})/2)*2`
      : `trunc((${growH}-${spanH}*t/${dur.toFixed(3)})/2)*2`
  const filters = zooming
    ? [
        `scale=${growW}:${growH}:force_original_aspect_ratio=increase:flags=bilinear`,
        `crop=${growW}:${growH}:(iw-${growW})/2:(ih-${growH})/2`,
        `crop=w='${widthExpr}':h='${heightExpr}':x='(iw-ow)/2':y='(ih-oh)/2'`,
        `scale=${frameWidth}:${frameHeight}:flags=bilinear`,
        `fps=${fps}`,
      ]
    : [`scale=${placed.width}:${placed.height}:flags=bilinear`, `fps=${fps}`]
  if (fadeIn > 0.01) filters.push(`fade=t=in:st=0:d=${num(Math.min(fadeIn, clip.duration))}`)
  filters.push('format=rgba', `setpts=PTS-STARTPTS+${num(clip.start)}/TB`)
  return `[${inputIndex}:v]${filters.join(',')}[${label}]`
}

function audioChain(clip: GraphClip, inputIndex: number, label: string, mix: number): string {
  const playable = playableDuration(clip)
  const volume = clip.muted ? 0 : clip.volume * mix
  const delay = Math.max(0, Math.round(clip.start * 1000))
  const filters = [
    `atrim=start=${num(clip.trimStart)}:duration=${num(playable)}`,
    'asetpts=PTS-STARTPTS',
    'aformat=sample_rates=48000:channel_layouts=stereo',
    clip.fadeIn > 0.01 ? `afade=t=in:st=0:d=${num(clip.fadeIn)}` : '',
    clip.fadeOut > 0.01
      ? `afade=t=out:st=${num(Math.max(0, playable - clip.fadeOut))}:d=${num(Math.min(clip.fadeOut, playable))}`
      : '',
    `volume=${num(volume)}`,
    `adelay=${delay}|${delay}`,
  ].filter(Boolean)
  return `[${inputIndex}:a]${filters.join(',')}[${label}]`
}

export function dissolveOverlap(duration: number, nextDuration: number | null, crossfade: number): number {
  if (nextDuration == null) return 0
  return Math.min(Math.max(0, crossfade), duration / 2, nextDuration / 2)
}

export function buildFilterGraph(
  clips: GraphClip[],
  total: number,
  voiceVolume: number,
  videoMix: number,
  options: GraphOptions = {},
): string {
  const frameWidth = options.width ?? 1920
  const frameHeight = options.height ?? 1080
  const fps = options.fps ?? 30
  const zoomDepth = options.zoomDepth ?? 0
  const zoomDirection = options.zoomDirection ?? 'in'
  const crossfade = Math.max(0, options.crossfade ?? 0)
  const duration = Math.max(0.1, total)
  const parts: string[] = [
    `color=c=black:s=${frameWidth}x${frameHeight}:r=${fps}:d=${num(duration)}[base0]`,
  ]
  const mixLabels: string[] = []
  let base = 'base0'

  clips.forEach((clip, index) => {
    const inputIndex = index + 1
    const visual = `v${index}`
    const previousClip = index > 0 ? clips[index - 1] : null
    const fadeIn = Math.max(
      clip.fadeIn,
      previousClip ? dissolveOverlap(previousClip.duration, clip.duration, crossfade) : 0,
    )
    parts.push(
      clip.type === 'image'
        ? imageChain(
            clip,
            inputIndex,
            visual,
            frameWidth,
            frameHeight,
            fps,
            zoomDepth,
            zoomDirection,
            fadeIn,
          )
        : videoChain(clip, inputIndex, visual, fps, fadeIn, clip.fadeOut),
    )
    const zooming = clip.type === 'image' && zoomDepth > 0.001
    const rect = clip.prepared || zooming
      ? { x: 0, y: 0 }
      : frameRect(
          clip.width,
          clip.height,
          clip.fit,
          clip.scale,
          clip.positionX,
          clip.positionY,
          frameWidth,
          frameHeight,
        )
    const next = `base${index + 1}`
    parts.push(
      `[${base}][${visual}]overlay=x=${rect.x}:y=${rect.y}:eof_action=pass:shortest=0[${next}]`,
    )
    base = next
    if (clip.type === 'video' && clip.hasAudio && !clip.muted && clip.volume * videoMix > 0.001) {
      const audio = `a${index}`
      parts.push(audioChain(clip, inputIndex, audio, videoMix))
      mixLabels.push(audio)
    }
  })

  const grade = effectChain(options.effect ?? 'none', base, 'graded')
  if (grade) {
    parts.push(grade)
    parts.push('[graded]format=yuv420p[vout]')
  } else {
    parts.push(`[${base}]format=yuv420p[vout]`)
  }
  const voiceLabel = mixLabels.length === 0 ? 'aout' : 'vo'
  parts.push(
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${num(voiceVolume)},apad=whole_dur=${num(duration)}[${voiceLabel}]`,
  )
  if (mixLabels.length > 0) {
    const inputs = ['[vo]', ...mixLabels.map((label) => `[${label}]`)].join('')
    parts.push(
      `${inputs}amix=inputs=${mixLabels.length + 1}:duration=first:dropout_transition=0:normalize=0[aout]`,
    )
  }
  return parts.join(';')
}

export function extensionFor(name: string, fallback: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (!ext || ext.length > 5) return fallback
  return ext
}
