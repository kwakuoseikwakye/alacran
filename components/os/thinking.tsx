/**
 * Three drops that merge and part while work is in flight — the liquid
 * indicator, drawn with the #a-gooey filter defined once in app/layout.tsx.
 * Under reduced motion the drops sit still (see .thinking in globals.css).
 */
export function Thinking({ label = "Working" }: { label?: string }) {
  return (
    <span className="thinking" role="status" aria-label={label}>
      <i />
      <i />
      <i />
    </span>
  )
}
