/** The drawing arithmetic for the strings on the Companies page, kept apart
 *  from the component so it can be checked without a browser. Pure: rectangles
 *  in, SVG path and midpoint out. */
export type Rect = { left: number; top: number; width: number; height: number }
export type Point = { x: number; y: number }
/** `x` and `y` leave one point and arrive at the other head-on; `side` is a
 *  string between two tiles stacked in a column, which bulges out past their
 *  right edges instead of running through the gap — a gap of ten pixels is too
 *  short to read as a string at all, and a string from the first tile to the
 *  third would otherwise cut across the second. */
export type Axis = "x" | "y" | "side"

const centre = (r: Rect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })

/** Where a string leaves one tile and enters another: the two sides that face
 *  each other, so it never crosses the tiles it joins. Horizontal when the
 *  centres are further apart sideways than up and down. */
export function facingAnchors(a: Rect, b: Rect): { p1: Point; p2: Point; axis: Axis } {
  const ac = centre(a)
  const bc = centre(b)
  const dx = bc.x - ac.x
  const dy = bc.y - ac.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { p1: { x: a.left + a.width, y: ac.y }, p2: { x: b.left, y: bc.y }, axis: "x" }
      : { p1: { x: a.left, y: ac.y }, p2: { x: b.left + b.width, y: bc.y }, axis: "x" }
  }
  // Stacked: leave and arrive on the right edges, and let `stringPath` bulge outward.
  return {
    p1: { x: a.left + a.width, y: ac.y },
    p2: { x: b.left + b.width, y: bc.y },
    axis: "side",
  }
}

/** A curve that leaves p1 and arrives at p2 along `axis`, with a droop so it
 *  reads as a string with weight rather than a ruled line. `mid` is where the
 *  curve actually is halfway (t = 0.5), for anchoring a popover on it. */
export function stringPath(p1: Point, p2: Point, axis: Axis, sag = 22): { d: string; mid: Point } {
  let c1: Point
  let c2: Point
  if (axis === "side") {
    const dy = p2.y - p1.y
    // Further apart bulges further out, within a range that stays on the page.
    const bulge = Math.min(96, 48 + Math.abs(dy) * 0.08)
    c1 = { x: p1.x + bulge, y: p1.y + dy * 0.2 }
    c2 = { x: p2.x + bulge, y: p2.y - dy * 0.2 }
  } else {
    const half = axis === "x" ? { x: (p2.x - p1.x) / 2, y: 0 } : { x: 0, y: (p2.y - p1.y) / 2 }
    c1 = { x: p1.x + half.x, y: p1.y + half.y + sag }
    c2 = { x: p2.x - half.x, y: p2.y - half.y + sag }
  }
  const at = (t: number, a: number, b: number, c: number, d: number) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
  return {
    d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    mid: { x: at(0.5, p1.x, c1.x, c2.x, p2.x), y: at(0.5, p1.y, c1.y, c2.y, p2.y) },
  }
}

/** The string being dragged: from the handle to wherever the pointer is. */
export function dragPath(from: Point, to: Point): string {
  const axis: Axis = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? "x" : "y"
  return stringPath(from, to, axis, 14).d
}

/** A pointer that barely moved was a click, not a drag. */
export const DRAG_THRESHOLD_PX = 6
export function movedFarEnough(start: Point, now: Point): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) >= DRAG_THRESHOLD_PX
}
