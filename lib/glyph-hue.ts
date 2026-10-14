/** A small fixed set of the app's own accent tokens, cycled by id so each
 *  company reads as a distinct chip wherever it needs an identity glyph —
 *  the switcher pill and the overview card — without new colour tokens or
 *  per-company state. */
const GLYPH_HUES = ["var(--primary)", "var(--ember)", "var(--success)", "var(--warning)"]

export function glyphHue(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return GLYPH_HUES[Math.abs(hash) % GLYPH_HUES.length]
}
