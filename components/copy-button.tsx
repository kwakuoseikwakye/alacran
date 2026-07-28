"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Copy-to-clipboard with a 1.5s confirmation. Shared by the Connect page and onboarding. */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={`h-7 shrink-0 px-2 transition-transform active:scale-95 ${className ?? ""}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard unavailable — user can still select the text
        }
      }}
    >
      {copied ? (
        <Check className="a-pop h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

/** A terminal command with a copy affordance. */
export function CommandLine({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
      <span aria-hidden="true" className="font-mono text-xs text-primary">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-pre">{command}</code>
      <CopyButton text={command} />
    </div>
  )
}
