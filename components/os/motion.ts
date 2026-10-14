/**
 * The frame's few moving moments, kept in one place. Each is decoration on
 * top of a change that has already happened, so each one finishes quickly,
 * swallows its own failures, and does nothing when the person has asked for
 * reduced motion.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * A copy of the approved card shrinks into the sidebar's Approvals count,
 * which pops as it lands. Plays after the approval is saved; resolves at once
 * with no card, no count on screen, or reduced motion.
 */
export function flyToApprovals(from: Element | null): Promise<void> {
  if (!from || prefersReducedMotion()) return Promise.resolve()
  const target = document.querySelector("[data-approvals-badge]")
  if (!target) return Promise.resolve()
  try {
    const start = from.getBoundingClientRect()
    const end = target.getBoundingClientRect()
    const ghost = from.cloneNode(true) as HTMLElement
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${start.left}px`,
      top: `${start.top}px`,
      width: `${start.width}px`,
      height: `${start.height}px`,
      margin: "0",
      zIndex: "80",
      overflow: "hidden",
      pointerEvents: "none",
      borderRadius: "8px",
      background: "var(--surface-2)",
    })
    document.body.appendChild(ghost)
    const dx = end.left + end.width / 2 - (start.left + start.width / 2)
    const dy = end.top + end.height / 2 - (start.top + start.height / 2)
    const flight = ghost.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 18}px) scale(0.4)`, opacity: 0.9, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.05)`, opacity: 0 },
      ],
      { duration: 560, easing: "cubic-bezier(.5, 0, .2, 1)" }
    )
    return flight.finished
      .then(() => {
        target.animate([{ transform: "scale(1)" }, { transform: "scale(1.3)" }, { transform: "scale(1)" }], {
          duration: 380,
          easing: "cubic-bezier(.2, .8, .2, 1)",
        })
      })
      .catch(() => {})
      .finally(() => ghost.remove())
  } catch {
    return Promise.resolve()
  }
}

type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

/**
 * Whether a sidebar click should blend into the next page. Not for a modified
 * click (a new tab or window is the browser's), and not for the page already
 * on screen: a blend waits for the URL to change, and that one never would.
 */
export function shouldBlend(click: ClickLike, isCurrentPage: boolean): boolean {
  if (isCurrentPage) return false
  return click.button === 0 && !click.metaKey && !click.ctrlKey && !click.shiftKey && !click.altKey
}

type DocumentWithTransitions = Document & { startViewTransition?: (update: () => Promise<void>) => unknown }

let finishBlend: (() => void) | null = null

/**
 * Navigate with the page blending into the next one rather than jumping.
 * The browser holds a snapshot of the old page until the new one has
 * rendered — `blendArrived` is called from the sidebar when the pathname
 * changes — or for 1.5s at most, so a slow page never freezes the window.
 * Falls straight through to `go` where View Transitions or motion are absent.
 */
export function blendTo(href: string, go: (href: string) => void) {
  const doc = document as DocumentWithTransitions
  if (!doc.startViewTransition || prefersReducedMotion()) {
    go(href)
    return
  }
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        finishBlend = resolve
        go(href)
        setTimeout(resolve, 1500)
      })
  )
}

export function blendArrived() {
  finishBlend?.()
  finishBlend = null
}
