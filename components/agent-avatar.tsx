/** Uploaded image if there is one; otherwise a quiet initial — the
 *  same identity glyph the workspace switcher uses, so a company reads as
 *  itself at a glance everywhere its avatar appears. */
export function AgentAvatar({ imageUrl, name }: { imageUrl: string | null; id: string; name: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a static/local asset next/image can optimize
    return <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-border" />
  }
  // Smaller than the photo variant above (26px, matching the reviewed
  // workspace prototype's `.co-glyph`) rather than a same-size placeholder
  // circle: a photo is content worth the full 40px, a single letter isn't.
  // `agent-avatar-glyph` is a stable hook for a tight container (the network
  // map's card) to size it down further, the same way that container already
  // forces the <img> variant to 22px.
  return (
    <span
      className="agent-avatar-glyph flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md border border-border bg-muted font-display text-xs font-bold text-muted-foreground"
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
