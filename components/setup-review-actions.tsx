import { Check, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * The last step of "Tell Alacrán about your business": one path that teaches
 * the loop (Alacrán drafts, it lands in Approvals, you approve) and one that
 * needs no AI (your own words, saved as you typed them — nothing to approve,
 * because nothing was drafted). Static so the words can be tested.
 */
export function SetupReviewActions({
  aiReady,
  pending,
  connectHref,
  onDraft,
  onSave,
}: {
  aiReady: boolean
  pending: boolean
  connectHref: string
  onDraft: () => void
  onSave: () => void
}) {
  const primary = "font-mono text-xs bg-os-accent text-os-bg hover:opacity-90 font-bold cursor-pointer"
  const quiet = "text-xs border-os-border hover:border-os-border-strong cursor-pointer"
  return (
    <div className="flex items-center gap-2">
      {aiReady ? (
        <Button type="button" size="sm" onClick={onDraft} disabled={pending} className={primary}>
          <Sparkles className="h-3.5 w-3.5 mr-1" />
          Let Alacrán write it up
        </Button>
      ) : (
        <a href={connectHref} className="text-xs underline text-os-dim hover:text-os-text">
          Connect your AI first to let Alacrán write it up
        </a>
      )}
      <Button
        type="button"
        size="sm"
        variant={aiReady ? "outline" : "default"}
        onClick={onSave}
        disabled={pending}
        className={aiReady ? quiet : primary}
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        {pending ? "Saving…" : "Save my answers as they are"}
      </Button>
    </div>
  )
}
