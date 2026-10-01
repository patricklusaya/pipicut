import { useState } from 'react'
import { BrandMark } from '@/components/brand/BrandMark.tsx'
import { ExtensionButton } from '@/components/import/ExtensionButton.tsx'
import { MASTER_PROMPT } from '@/lib/masterPrompt.ts'

export function MasterPrompt() {
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line px-4">
        <a href="#" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          <BrandMark className="size-5" />
          Pipicut
        </a>
        <a href="#" className="text-[12px] text-muted hover:text-text">
          Back
        </a>
        <div className="ml-auto flex items-center gap-2">
          <ExtensionButton />
          <button
            type="button"
            className="h-7 bg-accent px-2.5 text-[12px] font-medium text-[#101216]"
            onClick={() => {
              void navigator.clipboard.writeText(MASTER_PROMPT).then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              })
            }}
          >
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-auto px-6 py-6">
        <h1 className="text-[15px] font-medium">Master prompt</h1>
        <p className="mt-2 text-[13px] leading-5 text-muted">
          Copy this into ChatGPT, then paste your timestamped transcript under it.
        </p>
        <pre className="mt-4 border border-line bg-panel p-4 text-[12px] leading-5 whitespace-pre-wrap text-text">
          {MASTER_PROMPT}
        </pre>
      </main>
    </div>
  )
}
