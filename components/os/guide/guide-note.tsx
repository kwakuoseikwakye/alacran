import type { GuideRefresh } from "@/lib/guide/refresh"

/** One plain line when the operating guide could not be refreshed with a saved change. Null otherwise. */
export function guideNoteText(guide: GuideRefresh | undefined): string | null {
  if (!guide) return null
  if (guide.status === "needs-attention") {
    return guide.reason === "edited"
      ? "Saved. The operating guide wasn't updated because you edited it. Review it on the Skills page."
      : guide.reason === "dirty"
        ? "Saved. The operating guide wasn't updated because AGENTS.md has unsaved changes."
        : "Saved. The operating guide wasn't updated. Open the Skills page to see why."
  }
  if (guide.status === "failed") return "Saved. The operating guide could not be updated. Open the Skills page to try again."
  return null
}

export function GuideNote({ guide }: { guide: GuideRefresh | undefined }) {
  const text = guideNoteText(guide)
  return text ? <p role="status" className="text-sm text-muted-foreground">{text}</p> : null
}
