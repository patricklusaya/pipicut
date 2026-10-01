export const VISUAL_EFFECTS = [
  'none',
  'warm',
  'cool',
  'sepia',
  'grain',
  'vignette',
  'snow',
] as const

export type VisualEffect = (typeof VISUAL_EFFECTS)[number]

export const EFFECT_LABELS: Record<VisualEffect, string> = {
  none: 'None',
  warm: 'Warm',
  cool: 'Cool',
  sepia: 'Sepia',
  grain: 'Film grain',
  vignette: 'Vignette',
  snow: 'Snow',
}

export function isVisualEffect(value: string | undefined): value is VisualEffect {
  return VISUAL_EFFECTS.some((effect) => effect === value)
}

/** CSS grade for the preview. Snow and grain also draw an overlay. */
export function previewGrade(effect: VisualEffect): string | undefined {
  switch (effect) {
    case 'warm':
      return 'sepia(0.28) saturate(1.25) hue-rotate(-8deg)'
    case 'cool':
      return 'saturate(0.78) hue-rotate(16deg) brightness(1.04)'
    case 'sepia':
      return 'sepia(0.9) contrast(1.05)'
    case 'snow':
      return 'saturate(0.72) brightness(1.06)'
    default:
      return undefined
  }
}

/** ffmpeg filters from the composed picture to `output`. Empty when the effect is off. */
export function effectChain(effect: VisualEffect, input: string, output: string): string {
  switch (effect) {
    case 'none':
      return ''
    case 'warm':
      return `[${input}]colorbalance=rs=0.08:gs=0.03:bs=-0.08:rm=0.05:bm=-0.05[${output}]`
    case 'cool':
      return `[${input}]colorbalance=rs=-0.06:gs=0.02:bs=0.10[${output}]`
    case 'sepia':
      return `[${input}]colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131[${output}]`
    case 'grain':
      return `[${input}]noise=alls=14:allf=t[${output}]`
    case 'vignette':
      return `[${input}]vignette=PI/5[${output}]`
    case 'snow':
      return `[${input}]split[fxmain][fxsrc];[fxsrc]noise=alls=80:allf=t,eq=contrast=12:brightness=-0.68,scroll=vertical=2[fxspeck];[fxmain][fxspeck]blend=all_mode=screen[${output}]`
  }
}
