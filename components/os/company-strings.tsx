"use client"

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { cutShareLink, updateShareScope } from "@/lib/sharing/actions"
import { SHARE_SCOPE_KEYS, SHARE_SCOPE_LABELS, type ShareLink, type ShareScope } from "@/lib/sharing/model"
import { dragPath, facingAnchors, movedFarEnough, stringPath, type Point, type Rect } from "@/lib/sharing/string-geometry"
import { ShareConfirmDialog } from "@/components/os/share-confirm-dialog"

type Company = { id: string; name: string }
type Drag = { fromId: string; from: Point; to: Point; overId: string | null }

type Strings = {
  /** Two companies are the fewest a string can join. */
  enabled: boolean
  dragging: boolean
  begin: (fromId: string, event: React.PointerEvent) => void
}

const StringsContext = createContext<Strings | null>(null)

/** True while a string is being dragged. The tile grid reads it to stop the tile
 *  under the pointer from starting its own drag (reordering) at the same time. */
export function useStringDragging(): boolean {
  return useContext(StringsContext)?.dragging ?? false
}

/** The tile a point is over, if it is one of this canvas's. */
function companyAt(x: number, y: number, root: HTMLElement): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const tile = el.closest<HTMLElement>("[data-company-id]")
    if (tile && root.contains(tile)) return tile.dataset.companyId ?? null
  }
  return null
}

/**
 * The Companies page's strings: who shares knowledge with whom, drawn between
 * the company tiles and drawn BY dragging.
 *
 * Wraps the tile grid. Each tile carries `data-company-id` and a `ShareHandle`;
 * dragging from a handle to another tile opens a confirmation of exactly what
 * would be shared, and only confirming creates the string (a string is "access
 * changes hands", so a drop alone never does it). One way: the arrowhead is on
 * the company that receives.
 *
 * Positions are measured from the real tiles rather than computed, because the
 * grid wraps and reorders: they are re-measured on resize and whenever the grid's
 * children move. The layer itself takes no pointer events except on a string, so
 * the tiles under it stay clickable.
 */
export function CompanyStrings({ links, companies, children }: { links: ShareLink[]; companies: Company[]; children: ReactNode }) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const [rects, setRects] = useState<Record<string, Rect>>({})
  const [drag, setDrag] = useState<Drag | null>(null)
  const [pending, setPending] = useState<{ fromId: string; toId: string } | null>(null)
  const [chooser, setChooser] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragRef = useRef<Drag | null>(null)

  const nameOf = useCallback((id: string) => companies.find((c) => c.id === id)?.name ?? "that company", [companies])
  const enabled = companies.length >= 2

  const measure = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const next: Record<string, Rect> = {}
    for (const tile of root.querySelectorAll<HTMLElement>("[data-company-id]")) {
      const r = tile.getBoundingClientRect()
      next[tile.dataset.companyId ?? ""] = { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height }
    }
    setRects(next)
  }, [])

  useLayoutEffect(() => {
    measure()
    const root = rootRef.current
    if (!root) return
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = new ResizeObserver(later)
    resize.observe(root)
    // Reordering moves the tiles without resizing anything.
    const mutate = new MutationObserver(later)
    mutate.observe(root, { childList: true, subtree: true })
    window.addEventListener("resize", later)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutate.disconnect()
      window.removeEventListener("resize", later)
    }
  }, [measure, links.length, companies.length])

  const begin = useCallback((fromId: string, event: React.PointerEvent) => {
    const root = rootRef.current
    if (!root || event.button !== 0) return
    // Stops text selection, and the grid's own tile drag, from starting too.
    event.preventDefault()
    setChooser(null)
    setSelectedId(null)
    const base = root.getBoundingClientRect()
    const start = { x: event.clientX, y: event.clientY }
    const handle = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const from = { x: handle.left + handle.width / 2 - base.left, y: handle.top + handle.height / 2 - base.top }
    let moved = false

    const stop = () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onCancel)
      window.removeEventListener("keydown", onKey)
      dragRef.current = null
      setDrag(null)
    }
    const onMove = (ev: PointerEvent) => {
      if (!moved && !movedFarEnough(start, { x: ev.clientX, y: ev.clientY })) return
      moved = true
      const over = companyAt(ev.clientX, ev.clientY, root)
      const next = { fromId, from, to: { x: ev.clientX - base.left, y: ev.clientY - base.top }, overId: over && over !== fromId ? over : null }
      dragRef.current = next
      setDrag(next)
    }
    const onUp = () => {
      const last = dragRef.current
      stop()
      if (moved) {
        // A release over the tile it started on still fires a click on that
        // tile, which would open the company. Swallow that one click.
        const swallow = (ev: MouseEvent) => ev.stopPropagation()
        window.addEventListener("click", swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 100)
      }
      if (!moved) setChooser(fromId)
      else if (last?.overId) setPending({ fromId, toId: last.overId })
    }
    const onCancel = () => stop()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") stop()
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onCancel)
    window.addEventListener("keydown", onKey)
    // Mark the drag as begun at once so the grid drops its own `draggable`.
    setDrag({ fromId, from, to: from, overId: null })
  }, [])

  const context = useMemo<Strings>(() => ({ enabled, dragging: drag !== null, begin }), [enabled, drag, begin])

  const drawn = links
    .map((link) => {
      const a = rects[link.from]
      const b = rects[link.to]
      if (!a || !b) return null
      const { p1, p2, axis } = facingAnchors(a, b)
      return { link, ...stringPath(p1, p2, axis) }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const selected = drawn.find((d) => d.link.id === selectedId) ?? null
  const target = drag?.overId ? rects[drag.overId] : null
  const chooserRect = chooser ? rects[chooser] : null

  return (
    <StringsContext.Provider value={context}>
      <div
        ref={rootRef}
        className="company-strings"
        onPointerDown={(event) => {
          // Anywhere that is not a string or its popover puts the popover away.
          if (!(event.target as Element).closest("[data-keep-open]")) {
            setSelectedId(null)
            setChooser(null)
          }
        }}
      >
        {enabled ? (
          <p className="company-strings-hint">
            {links.length === 0
              ? "To let one company share what it knows with another, drag from a company's Share handle onto the other company."
              : `${links.length} ${links.length === 1 ? "string connects" : "strings connect"} your companies. The arrow points at the company that receives the knowledge.`}
          </p>
        ) : null}

        {children}

        <svg className="company-strings-layer" aria-hidden>
          <defs>
            <marker id="company-string-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="company-string-arrowhead" />
            </marker>
          </defs>
          {drawn.map(({ link, d }) => (
            <g key={link.id} className="company-string-group" data-selected={link.id === selectedId ? "" : undefined} data-keep-open>
              <path className="company-string" d={d} markerEnd="url(#company-string-arrow)" />
              <path
                className="company-string-hit"
                d={d}
                onClick={() => {
                  setChooser(null)
                  setSelectedId(link.id)
                }}
              >
                <title>{`${nameOf(link.from)} shares with ${nameOf(link.to)}. Click to change or cut.`}</title>
              </path>
            </g>
          ))}
          {drag && drag.to !== drag.from ? <path className="company-string company-string--drag" d={dragPath(drag.from, drag.to)} /> : null}
          {target ? <rect className="company-string-target" x={target.left - 4} y={target.top - 4} width={target.width + 8} height={target.height + 8} rx={16} /> : null}
        </svg>

        {/* The same strings for a keyboard or a screen reader: the drawn ones
            are an image of this list. */}
        <ul className="sr-only" aria-label="Knowledge sharing between companies">
          {links.map((link) => (
            <li key={link.id}>
              <button type="button" onClick={() => setSelectedId(link.id)}>
                {nameOf(link.from)} shares with {nameOf(link.to)}. Change or cut.
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <StringPopover
            key={selected.link.id}
            link={selected.link}
            fromName={nameOf(selected.link.from)}
            toName={nameOf(selected.link.to)}
            at={selected.mid}
            onClose={() => setSelectedId(null)}
            onChanged={() => router.refresh()}
          />
        ) : null}

        {chooser && chooserRect ? (
          <div
            className="company-strings-pop"
            role="menu"
            aria-label={`Share ${nameOf(chooser)}'s knowledge with`}
            data-keep-open
            style={{ left: Math.max(8, chooserRect.left + chooserRect.width - 240), top: chooserRect.top + 40 }}
          >
            <p className="company-strings-pop-title">Share {nameOf(chooser)}&apos;s knowledge with…</p>
            {companies
              .filter((c) => c.id !== chooser)
              .map((c) => {
                const already = links.some((l) => l.from === chooser && l.to === c.id)
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitem"
                    className="company-strings-pop-item"
                    disabled={already}
                    onClick={() => {
                      setPending({ fromId: chooser, toId: c.id })
                      setChooser(null)
                    }}
                  >
                    {c.name}
                    {already ? <span> · already shared</span> : null}
                  </button>
                )
              })}
          </div>
        ) : null}

        {pending ? (
          <ShareConfirmDialog
            fromId={pending.fromId}
            toId={pending.toId}
            fromName={nameOf(pending.fromId)}
            toName={nameOf(pending.toId)}
            onClose={() => setPending(null)}
            onDone={() => {
              setPending(null)
              router.refresh()
            }}
          />
        ) : null}
      </div>
    </StringsContext.Provider>
  )
}

/** The dot on a tile that a string is dragged out of. A click, with no drag,
 *  opens a short list of companies to share with instead — the same thing for a
 *  keyboard, and for anyone who finds dragging fiddly. */
export function ShareHandle({ companyId, companyName }: { companyId: string; companyName: string }) {
  const strings = useContext(StringsContext)
  if (!strings?.enabled) return null
  return (
    <button
      type="button"
      className="share-handle"
      onPointerDown={(event) => strings.begin(companyId, event)}
      title={`Drag onto another company to share what ${companyName} knows with it. Or click to choose.`}
      aria-label={`Share ${companyName}'s knowledge with another company`}
    >
      <span className="share-handle-dot" aria-hidden />
      <span>Share</span>
    </button>
  )
}

function StringPopover({
  link,
  fromName,
  toName,
  at,
  onClose,
  onChanged,
}: {
  link: ShareLink
  fromName: string
  toName: string
  at: Point
  onClose: () => void
  onChanged: () => void
}) {
  const [scope, setScope] = useState<ShareScope>(link.scope)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function change(next: ShareScope) {
    // Optimistic: the box flips at once, and goes back if the change is refused
    // (the last switch cannot be turned off — that is what cutting is for).
    const before = scope
    setScope(next)
    setBusy(true)
    setMessage(null)
    const result = await updateShareScope(link.id, next)
    setBusy(false)
    if (result.ok) onChanged()
    else {
      setScope(before)
      setMessage(result.message)
    }
  }

  async function cut() {
    setBusy(true)
    const result = await cutShareLink(link.id)
    setBusy(false)
    if (result.ok) {
      onChanged()
      onClose()
    } else setMessage(result.message)
  }

  return (
    <div className="company-strings-pop" role="dialog" aria-label={`${fromName} shares with ${toName}`} data-keep-open style={{ left: Math.max(8, at.x - 130), top: at.y + 10 }}>
      <p className="company-strings-pop-title">
        {fromName} shares with {toName}
      </p>
      {SHARE_SCOPE_KEYS.map((key) => (
        <label key={key} className="company-strings-pop-check" title={SHARE_SCOPE_LABELS[key].hint}>
          <input type="checkbox" checked={scope[key]} disabled={busy} onChange={(event) => void change({ ...scope, [key]: event.target.checked })} />
          {SHARE_SCOPE_LABELS[key].label}
        </label>
      ))}
      {message ? (
        <p className="company-strings-pop-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="company-strings-pop-actions">
        <button type="button" className="company-strings-pop-btn" disabled={busy} onClick={() => void cut()} title={`Stop ${fromName} sharing with ${toName}. ${toName}'s assistants stop seeing it straight away.`}>
          Cut string
        </button>
        <button type="button" className="company-strings-pop-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  )
}
