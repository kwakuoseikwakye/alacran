"use client"

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { dragTrack, evenTracks } from "@/lib/terminal/grid-layout"

export type TrackAxis = "cols" | "rows"

/** The grid's own padding and gap, from `.terminal-pane--grid .terminal-slots` in globals.css. */
const EDGE = 6
const GAP = 6
const HIT = 10
const KEY_STEP = 0.02

/** Where the line after track `index` sits, in the container's own coordinates. */
function offset(tracks: number[], index: number): string {
  const before = tracks.slice(0, index + 1).reduce((a, b) => a + b, 0)
  const free = 2 * EDGE + GAP * (tracks.length - 1)
  return `calc(${EDGE}px + (100% - ${free}px) * ${before} + ${GAP * index + GAP / 2 - HIT / 2}px)`
}

/**
 * Drag handles between the terminals of the grid: left and right between
 * columns, up and down between rows.
 *
 * They are drawn over the grid, not between its panes, because the panes live
 * in one container in a fixed order (moving a terminal to another parent blanks
 * it). A handle only changes the column and row sizes; each terminal's own
 * ResizeObserver refits it. Panes share rows and columns, so a handle moves the
 * line for the whole row or column.
 */
export function TerminalGutters({
  cols,
  rows,
  onChange,
}: {
  cols: number[]
  rows: number[]
  /** `commit` is false while a drag is in progress and true when it ends, so the caller saves once. */
  onChange: (axis: TrackAxis, tracks: number[], commit: boolean) => void
}) {
  function startDrag(event: ReactPointerEvent<HTMLDivElement>, axis: TrackAxis, index: number, tracks: number[]) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const box = handle.parentElement?.getBoundingClientRect()
    if (!box) return
    const free = (axis === "cols" ? box.width : box.height) - 2 * EDGE - GAP * (tracks.length - 1)
    if (free <= 0) return
    const origin = axis === "cols" ? event.clientX : event.clientY
    let latest = tracks
    handle.setPointerCapture(event.pointerId)
    handle.setAttribute("data-dragging", "")
    document.body.style.userSelect = "none"
    const move = (e: PointerEvent) => {
      latest = dragTrack(tracks, index, ((axis === "cols" ? e.clientX : e.clientY) - origin) / free)
      onChange(axis, latest, false)
    }
    const end = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", end)
      handle.removeEventListener("pointercancel", end)
      handle.removeAttribute("data-dragging")
      document.body.style.userSelect = ""
      onChange(axis, latest, true)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", end)
    handle.addEventListener("pointercancel", end)
  }

  function onKey(event: ReactKeyboardEvent<HTMLDivElement>, axis: TrackAxis, index: number, tracks: number[]) {
    const back = axis === "cols" ? "ArrowLeft" : "ArrowUp"
    const forward = axis === "cols" ? "ArrowRight" : "ArrowDown"
    if (event.key !== back && event.key !== forward) return
    event.preventDefault()
    onChange(axis, dragTrack(tracks, index, event.key === forward ? KEY_STEP : -KEY_STEP), true)
  }

  const handles = (axis: TrackAxis, tracks: number[]) =>
    tracks.slice(0, -1).map((_, index) => {
      const place = offset(tracks, index)
      const label = axis === "cols" ? "Resize terminals left and right" : "Resize terminals up and down"
      return (
        <div
          key={`${axis}-${index}`}
          role="separator"
          aria-orientation={axis === "cols" ? "vertical" : "horizontal"}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(tracks.slice(0, index + 1).reduce((a, b) => a + b, 0) * 100)}
          tabIndex={0}
          title="Drag to resize, or use the arrow keys. Double-click to make them even again."
          className={`terminal-gutter terminal-gutter--${axis}`}
          style={axis === "cols" ? { left: place } : { top: place }}
          onPointerDown={(e) => startDrag(e, axis, index, tracks)}
          onKeyDown={(e) => onKey(e, axis, index, tracks)}
          onDoubleClick={() => onChange(axis, evenTracks(tracks.length), true)}
        />
      )
    })

  return (
    <>
      {handles("cols", cols)}
      {handles("rows", rows)}
    </>
  )
}
