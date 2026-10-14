/**
 * The terminal page is intentionally empty.
 *
 * The actual terminal UI lives in the company layout (`TerminalPersist`), which
 * keeps it mounted across all `/c/[companyId]/*` navigations so sessions
 * survive page changes. This page exists only to give the `/terminal` route a
 * valid entry point — the layout detects the pathname and shows the terminal
 * when the user is here, hides it when they navigate elsewhere.
 *
 * Why this is better than the old approach:
 * - Before: navigating away unmounted xterm, closed the EventSource, and lost
 *   the tab state. Coming back reconnected from backlog with a visible flash.
 * - Now: the terminal stays alive in the DOM. Navigating away collapses its
 *   container; navigating back reveals it instantly, mid-session.
 */
export default function CompanyTerminalPage() {
  return null
}
