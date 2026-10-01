import { useEffect } from 'react'
import { engine } from '@/lib/engine.ts'
import { clock } from '@/lib/clock.ts'
import { usePlayback } from '@/store/playbackStore.ts'
import { useProject } from '@/store/projectStore.ts'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
}

export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.code === 'Space') {
        event.preventDefault()
        engine.toggle()
        return
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        event.preventDefault()
        const step = event.shiftKey ? 0.1 : 1
        const direction = event.code === 'ArrowLeft' ? -1 : 1
        engine.seek(clock.time + direction * step)
        return
      }
      if (event.code === 'Delete' || event.code === 'Backspace') {
        const id = usePlayback.getState().selectedClipId
        if (!id) return
        event.preventDefault()
        useProject.getState().deleteClip(id)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') {
        event.preventDefault()
        if (event.shiftKey) useProject.getState().redo()
        else useProject.getState().undo()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'KeyY') {
        event.preventDefault()
        useProject.getState().redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
