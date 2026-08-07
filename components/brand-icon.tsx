import { BRAND_ICONS, type BrandId } from "@/lib/brand-icons"
import { cn } from "@/lib/utils"

export type { BrandId }

/**
 * A real product mark (Gmail, Claude, GitHub, …) from the Simple Icons dataset.
 *
 * Marks are monochrome by design: on Alacrán's near-black surfaces a grid of
 * full-colour vendor logos reads as noise and fights the single-accent palette.
 * `tone="brand"` opts one mark into the vendor's own colour for the moments
 * that earn it: a live connection, a hover, the hero orbit.
 */
export function BrandIcon({
  id,
  className,
  tone = "inherit",
  title,
}: {
  id: BrandId
  className?: string
  tone?: "inherit" | "brand"
  title?: string
}) {
  const icon = BRAND_ICONS[id]
  const label = title ?? icon.title
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      fill={tone === "brand" ? icon.onDark : "currentColor"}
    >
      <title>{label}</title>
      <path d={icon.path} />
    </svg>
  )
}

/** The vendor colour to use for a mark on a dark surface. */
export function brandColor(id: BrandId) {
  return BRAND_ICONS[id].onDark
}
