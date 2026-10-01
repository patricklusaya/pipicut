import { Puzzle } from 'lucide-react'
import { Button } from '@/components/ui/button.tsx'

const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/cchaijnmiipafncpnhenlkifhljmehha?utm_source=item-share-cb'

export function ExtensionButton() {
  return (
    <Button variant="outline" asChild className="extension-blink border-accent text-accent">
      <a href={EXTENSION_URL} target="_blank" rel="noreferrer" title="Gemini Auto Image Saver">
        <Puzzle className="size-3.5" aria-hidden="true" />
        Extension
      </a>
    </Button>
  )
}
