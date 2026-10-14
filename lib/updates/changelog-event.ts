export const ALACRAN_OPEN_CHANGELOG_EVENT = "alacran-open-changelog"

export type OpenChangelogDetail = {
  highlightVersion?: string
  initialTab?: "all" | "feature" | "improvement" | "fix"
}

export function openChangelogModal(detail?: OpenChangelogDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(ALACRAN_OPEN_CHANGELOG_EVENT, {
      detail: detail ?? {},
      bubbles: true,
    })
  )
}
