/** Copy from a click handler, including desktop webviews that deny Clipboard API access. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // The mac shell denies Clipboard API permissions. Its user-initiated copy
    // command still works without opening up clipboard reads or a native bridge.
  }

  if (typeof document === "undefined") return false
  const previousFocus = document.activeElement as HTMLElement | null
  const input = document.createElement("textarea")
  input.value = text
  input.setAttribute("readonly", "")
  input.style.position = "fixed"
  input.style.opacity = "0"
  input.style.pointerEvents = "none"
  try {
    document.body.appendChild(input)
    input.focus()
    input.select()
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    input.remove()
    previousFocus?.focus?.({ preventScroll: true })
  }
}
