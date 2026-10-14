import { Button } from "@/components/ui/button"
import { LogTailView } from "@/components/log-tail-view"
import { LoopStrip } from "@/components/os/loop-strip"

/**
 * What the wizard shows while Alacrán drafts the company profile, and after.
 * It no longer approves anything itself: a finished draft is a pending review
 * like any other, so the person is sent to Approvals, the one place that
 * shows a readable before-and-after and the same buttons every time.
 */
export function DefineCompanyDraftView({
  phase,
  changed,
  noChangeMessage,
  message,
  tail,
  onReview,
  onBack,
}: {
  phase: "running" | "finished"
  /** Finished, and Alacrán left a draft to review. */
  changed: boolean
  /** Finished with nothing to review: what Alacrán said about it. */
  noChangeMessage: string | null
  /** A failed start, in words. */
  message: string | null
  tail: string
  onReview: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-3">
      <LoopStrip current={phase === "finished" && changed ? "approve" : "draft"} />
      {phase === "running" && (
        <>
          <p className="text-sm text-muted-foreground">
            Alacrán is writing up your business from your answers.
          </p>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Show progress</summary>
            <LogTailView content={tail} />
          </details>
        </>
      )}
      {phase === "finished" && changed && (
        <>
          <p className="text-sm">
            Your draft is ready. It describes your whole business, so check it carefully in Approvals. Nothing is saved until you approve it.
          </p>
          {/* Approvals reads a company-profile draft back in plain sentences (lib/company-commands/
              profile-preview.ts) but still rates any change to it "High risk" (it is core facts, so
              it gets individual review). Said here first, so a first-time user is not met by a red
              chip with no context. The classifier is left alone. */}
          <p className="text-sm text-muted-foreground">
            Approvals reads it back to you in plain sentences and marks it “High risk”. That only means everything Alacrán does later builds on your company profile, so it deserves a careful read. It does not mean anything is wrong.
          </p>
        </>
      )}
      {phase === "finished" && !changed && (
        <p className="text-sm text-muted-foreground">
          {noChangeMessage ?? "Alacrán didn't have a draft to show. You can go back and save your answers as they are."}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs text-destructive">
          {message}
        </p>
      )}
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          Back to my answers
        </Button>
        {phase === "finished" && changed && (
          <Button size="sm" onClick={onReview}>
            Review it in Approvals
          </Button>
        )}
      </div>
    </div>
  )
}
