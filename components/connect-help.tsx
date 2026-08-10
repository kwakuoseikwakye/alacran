"use client"

import { useEffect, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

/** Bumped only if this guide's content changes enough that a returning user should see it again. */
export const CONNECT_GUIDE_SEEN_KEY = "alacran-connect-guide-seen"

const STEPS: { label: string; blurb: string }[] = [
  {
    label: "What's a \"Terminal\"?",
    blurb:
      "A plain text window for typing commands instead of clicking. A few of the tools below need one command run there, once, to sign in.",
  },
  {
    label: "Opening one",
    blurb:
      'Mac: press Cmd+Space, type "Terminal", press Enter. Windows: search "PowerShell" in the Start menu. Linux: usually Ctrl+Alt+T, or search "Terminal".',
  },
  {
    label: "Running the command on a card below",
    blurb:
      'Press the Copy button next to it, click inside the Terminal window, paste (Cmd+V on Mac, Ctrl+V elsewhere), press Enter, and follow anything it asks (usually signing in with your browser).',
  },
  {
    label: "Just installed something?",
    blurb:
      "Fully quit and reopen the Alacrán app itself — not just this browser tab — before pressing Re-check. The app only checks what's installed when it starts up, so a fresh install won't be seen until it restarts.",
  },
  {
    label: "After that",
    blurb: 'Press "Re-check" at the top of this page. A card turns green once it finds you\'re signed in.',
  },
]

/**
 * The answer to "I don't know how to connect any of this." Non-technical
 * users hit real friction here (a real report: install guidance assumed
 * comfort with a terminal that wasn't there). Deliberately generic — it
 * explains the mechanics every card shares (open a terminal, copy/paste a
 * command, restart after installing) rather than re-describing what each
 * tool does, which is already on its own card and would drift out of sync
 * here if a new one's ever added.
 */
export function ConnectHelp({ anyNotConnected }: { anyNotConnected: boolean }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!anyNotConnected) return
    if (window.localStorage.getItem(CONNECT_GUIDE_SEEN_KEY)) return
    window.localStorage.setItem(CONNECT_GUIDE_SEEN_KEY, "1")
    setOpen(true)
  }, [anyNotConnected])

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="How to connect these"
      >
        <HelpCircle className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Connecting your tools, step by step</SheetTitle>
            <SheetDescription>
              No coding experience needed — here&apos;s exactly what each step means.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4 text-sm">
            {STEPS.map((step) => (
              <section key={step.label} className="space-y-1">
                <h3 className="font-medium">{step.label}</h3>
                <p className="text-muted-foreground">{step.blurb}</p>
              </section>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
