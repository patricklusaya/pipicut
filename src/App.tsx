import { Component, useEffect, useState, type ReactNode } from 'react'
import { Editor } from '@/components/editor/Editor.tsx'
import { ImportScreen } from '@/components/import/ImportScreen.tsx'
import { MasterPrompt } from '@/components/import/MasterPrompt.tsx'
import { TooltipProvider } from '@/components/ui/tooltip.tsx'
import { usePersistence } from '@/hooks/usePersistence.ts'
import { useProject } from '@/store/projectStore.ts'

class ViewBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error): { message: string } {
    return { message: error.message || 'Something went wrong.' }
  }

  render() {
    if (this.state.message) {
      return (
        <div className="flex h-dvh items-center justify-center bg-bg px-6">
          <div className="max-w-md">
            <p className="text-[13px]">Pipicut hit a problem and stopped this view.</p>
            <p className="mt-2 text-[12px] text-muted">{this.state.message}</p>
            <button
              type="button"
              className="mt-4 h-7 border border-line px-2.5 text-[12px]"
              onClick={() => this.setState({ message: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const ready = useProject((state) => state.ready)
  const inEditor = useProject(
    (state) => state.editing || state.clips.length > 0 || state.unassigned.length > 0,
  )
  const [hash, setHash] = useState(() => window.location.hash)

  usePersistence()

  useEffect(() => {
    void useProject.getState().hydrate()
  }, [])

  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  if (!ready) return <div className="h-dvh bg-bg" />

  return (
    <TooltipProvider>
      <ViewBoundary>
        {hash === '#prompt' ? <MasterPrompt /> : inEditor ? <Editor /> : <ImportScreen />}
      </ViewBoundary>
    </TooltipProvider>
  )
}
