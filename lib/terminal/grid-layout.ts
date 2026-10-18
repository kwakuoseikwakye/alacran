
/**
 * Columns and rows for `count` panes (spec §5): 1 full, 2 side by side, up to 4
 * as 2×2, up to 6 as 3×2, up to 8 as 4×2. Past eight — finished runs whose
 * sessions are gone are slots too — rows of four keep being added rather than
 * panes shrinking below something a person can read.
 */
export function gridFor(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count === 2) return { cols: 2, rows: 1 }
  if (count <= 4) return { cols: 2, rows: 2 }
  if (count <= 6) return { cols: 3, rows: 2 }
  return { cols: 4, rows: Math.ceil(count / 4) }
}

/** The smallest share of the grid a column or row may be dragged down to. */
export const MIN_TRACK = 0.12

/** `count` equal columns or rows, as shares of the grid that add up to one. */
export function evenTracks(count: number): number[] {
  const n = Math.max(1, Math.floor(count))
  return Array.from({ length: n }, () => 1 / n)
}

/**
 * Drags the line between track `index` and the next one by `delta` (a share of
 * the whole grid, negative to go back). The two neighbours trade space, every
 * other track keeps its size, and neither goes below `MIN_TRACK`, so a pane can
 * be made small but never lost. Panes share rows and columns, so the line moves
 * for the whole row or column.
 */
export function dragTrack(tracks: number[], index: number, delta: number): number[] {
  if (index < 0 || index >= tracks.length - 1) return tracks
  const pair = tracks[index] + tracks[index + 1]
  const first = Math.min(pair - MIN_TRACK, Math.max(MIN_TRACK, tracks[index] + delta))
  const next = tracks.slice()
  next[index] = first
  next[index + 1] = pair - first
  return next
}

/** Saved sizes are used only when they fit the grid about to be drawn; anything stale or damaged is even. */
export function tracksFor(count: number, saved: unknown): number[] {
  const n = Math.max(1, Math.floor(count))
  if (
    Array.isArray(saved) &&
    saved.length === n &&
    saved.every((v) => typeof v === "number" && Number.isFinite(v) && v >= MIN_TRACK - 1e-9) &&
    Math.abs(saved.reduce((a, b) => a + b, 0) - 1) < 0.01
  ) {
    return saved
  }
  return evenTracks(n)
}

/**
 * The layout once a terminal has been opened, given how many were already open
 * in its workspace. A second terminal goes beside the first, in the grid: in
 * focus it became a tab that hid the one you were working in, which is not
 * what opening "another terminal" asks for. The first keeps the chosen layout.
 */
export function layoutAfterOpen(current: "grid" | "focus", alreadyOpenHere: number): "grid" | "focus" {
  return alreadyOpenHere > 0 ? "grid" : current
}
