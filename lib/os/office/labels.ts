/** One person's label stack on screen: its anchor (the bottom centre of the name tag) and its size, in CSS pixels. */
export type LabelBox = {
  id: string
  x: number
  y: number
  /** The whole stack: the name tag plus the bubble above it. */
  width: number
  height: number
  /** The name tag alone, for when the bubble has to go. */
  tag: { width: number; height: number }
}

/** How far to lift a stack, and whether its bubble still fits. */
export type LabelPlace = { lift: number; bubble: boolean }

/**
 * Where each label stack goes so none overlap. The stack nearest the viewer (lowest on screen)
 * keeps its place and the ones behind it move up, so people standing together, like a queue at
 * your desk, keep every name and bubble readable. Above `top` (the stage's edge) a stack would be
 * cut off: it drops its bubble and keeps its name, and a crowd too big even for that overlaps on
 * the stage rather than vanishing. Ties go by id, so the answer does not depend on order.
 */
export function liftLabels(boxes: LabelBox[], top = -Infinity, gap = 4): Map<string, LabelPlace> {
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = []
  const settle = (b: LabelBox, width: number, height: number): number => {
    const x0 = b.x - width / 2
    const x1 = b.x + width / 2
    let bottom = b.y
    // Each move puts the stack above one placed stack for good, so this ends.
    for (let moved = true; moved; ) {
      moved = false
      for (const p of placed) {
        if (x0 < p.x1 && x1 > p.x0 && bottom - height < p.y1 && bottom > p.y0) {
          bottom = p.y0 - gap
          moved = true
        }
      }
    }
    return bottom
  }
  const places = new Map<string, LabelPlace>()
  for (const b of [...boxes].sort((a, c) => c.y - a.y || (a.id < c.id ? -1 : a.id > c.id ? 1 : 0))) {
    let { width, height } = b
    let bubble = true
    let bottom = settle(b, width, height)
    if (bottom - height < top) {
      ;({ width, height } = b.tag)
      bubble = false
      bottom = settle(b, width, height)
    }
    bottom = Math.max(bottom, top + height)
    placed.push({ x0: b.x - width / 2, x1: b.x + width / 2, y0: bottom - height, y1: bottom })
    places.set(b.id, { lift: b.y - bottom, bubble })
  }
  return places
}
