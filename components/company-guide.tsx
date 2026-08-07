"use client"

import { useEffect, useState } from "react"
import { HelpCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { buildGuideSteps, type CompanyGuideFlags } from "@/lib/company-guide-steps"

/** Bumped only if the guide's content changes enough that a returning user should see it again. */
export const GUIDE_SEEN_KEY = "alacran-guide-seen"

type CompanyGuideProps = CompanyGuideFlags & {
  companyName: string
  hasOntology: boolean
}

/**
 * The answer to "I set up my company, now what?" It's a plain-language walk
 * through every action actually available on this card, built from the same
 * show* flags AgentCard already uses (see lib/company-guide-steps.ts).
 * Opens itself once, the first time this browser sees a company with its
 * info already filled in; a small "?" on the card re-opens it anytime after.
 */
export function CompanyGuide({ companyName, hasOntology, ...flags }: CompanyGuideProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hasOntology) return
    if (window.localStorage.getItem(GUIDE_SEEN_KEY)) return
    window.localStorage.setItem(GUIDE_SEEN_KEY, "1")
    setOpen(true)
  }, [hasOntology])

  const steps = buildGuideSteps(flags)

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        className="size-7 shrink-0 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={`Guide for ${companyName}`}
      >
        <HelpCircle className="size-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>What you can do with {companyName}</SheetTitle>
            <SheetDescription>A quick walk-through of everything on this card.</SheetDescription>
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
