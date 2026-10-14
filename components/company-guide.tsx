"use client"

import { useEffect, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { buildGuideSteps, type CompanyGuideFlags } from "@/lib/company-guide-steps"
import { useAdvancedMode } from "@/components/advanced-only"

const OPEN_GUIDE_EVENT = "alacran:open-company-guide"

type CompanyGuideProps = CompanyGuideFlags & {
  companyName: string
  /** false when something else on the page opens it (CompanyGuideLink). */
  showTrigger?: boolean
}

/** Company profile's "What else can I do here?". The actions the guide
 *  explains sit under Advanced settings, so it opens that section too. */
export function CompanyGuideLink() {
  return (
    <button
      type="button"
      className="company-info-guide-link"
      onClick={() => {
        document.getElementById("advanced")?.setAttribute("open", "")
        window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))
      }}
    >
      What else can I do here?
    </button>
  )
}

/**
 * The answer to "I set up my company, now what?" It's a plain-language walk
 * through every action actually available on this card, built from the same
 * show* flags AgentCard already uses (see lib/company-guide-steps.ts).
 * Opens only when asked: the "?" on the card or CompanyGuideLink. It used to
 * open itself on first visit, over a page whose card is now collapsed, so it
 * explained buttons the reader could not see.
 */
export function CompanyGuide({ companyName, showTrigger = true, ...flags }: CompanyGuideProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_GUIDE_EVENT, show)
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, show)
  }, [])

  // v39's invariant: the guide can never explain a button that isn't on the
  // card. AdvancedOnly hides Open in Terminal and Connect tools in simple
  // mode, so the flags the guide is built from have to agree with what's
  // actually rendered — otherwise the guide describes two buttons the reader
  // cannot see.
  const advanced = useAdvancedMode()
  const steps = buildGuideSteps(
    advanced ? flags : { ...flags, showOpenTerminalButton: false, showMcpButton: false },
    advanced
  )

  return (
    <>
      {showTrigger && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => setOpen(true)}
          aria-label={`Guide for ${companyName}`}
        >
          <HelpCircle className="size-4" />
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>What you can do with {companyName}</SheetTitle>
            <SheetDescription>
              A quick walk-through of everything on this page, grouped the same way: things to run, what it
              knows, and what it connects to.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-4 text-sm">
            {steps.map((step) => (
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
