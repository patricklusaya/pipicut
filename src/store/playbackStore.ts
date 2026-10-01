import { create } from 'zustand'
import { clamp } from '@/lib/format.ts'

/** Low enough that Fit can show a multi-hour voiceover in one screen. */
export const MIN_PIXELS_PER_SECOND = 0.02
export const MAX_PIXELS_PER_SECOND = 280

interface PlaybackState {
  pixelsPerSecond: number
  snap: boolean
  selectedClipId: string | null
  setZoom: (pixelsPerSecond: number) => void
  zoomBy: (factor: number) => void
  toggleSnap: () => void
  select: (id: string | null) => void
}

export const usePlayback = create<PlaybackState>((set) => ({
  pixelsPerSecond: 48,
  snap: true,
  selectedClipId: null,
  setZoom: (pixelsPerSecond) =>
    set({ pixelsPerSecond: clamp(pixelsPerSecond, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND) }),
  zoomBy: (factor) =>
    set((state) => ({
      pixelsPerSecond: clamp(state.pixelsPerSecond * factor, MIN_PIXELS_PER_SECOND, MAX_PIXELS_PER_SECOND),
    })),
  toggleSnap: () => set((state) => ({ snap: !state.snap })),
  select: (selectedClipId) => set({ selectedClipId }),
}))
