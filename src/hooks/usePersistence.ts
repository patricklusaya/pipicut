import { useEffect } from 'react'
import { saveProject } from '@/lib/db.ts'
import { useProject } from '@/store/projectStore.ts'

export function usePersistence(): void {
  useEffect(() => {
    let timer = 0
    const persist = () => {
      const current = useProject.getState()
      if (!current.ready) return
      if (!current.audio && current.clips.length === 0 && current.unassigned.length === 0) return
      void saveProject(
        current.name,
        current.audio,
        current.clips,
        current.unassigned,
        current.voiceoverVolume,
        current.videoMix,
        {
          aspect: current.aspect,
          fps: current.fps,
          quality: current.quality,
          zoomDepth: current.zoomDepth,
          zoomDirection: current.zoomDirection,
          crossfade: current.crossfade,
          effect: current.effect,
        },
      )
        .then((result) => {
          useProject.getState().setStorageNote(
            result === 'saved'
              ? 'Saved on this device'
              : 'Kept for this session. Browser storage is full, so refresh will need the files again.',
          )
        })
        .catch(() => {
          useProject.getState().setStorageNote('Kept for this session.')
        })
    }
    const schedule = (delay: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(persist, delay)
    }
    schedule(250)
    const unsubscribe = useProject.subscribe((state, previous) => {
      if (!state.ready || !previous.ready) return
      if (
        state.clips === previous.clips &&
        state.audio === previous.audio &&
        state.unassigned === previous.unassigned &&
        state.name === previous.name &&
        state.voiceoverVolume === previous.voiceoverVolume &&
        state.videoMix === previous.videoMix &&
        state.aspect === previous.aspect &&
        state.fps === previous.fps &&
        state.quality === previous.quality &&
        state.zoomDepth === previous.zoomDepth &&
        state.zoomDirection === previous.zoomDirection &&
        state.crossfade === previous.crossfade &&
        state.effect === previous.effect
      ) {
        return
      }
      schedule(500)
    })
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
    }
  }, [])
}
