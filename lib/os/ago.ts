const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

/** "2 days ago", "yesterday", "1 hour ago". `now` is a parameter so a render is repeatable. */
export function ago(timestamp: number, now: Date): string {
  const seconds = Math.max(0, Math.round(now.getTime() / 1000 - timestamp))
  if (seconds < 3600) return relative.format(-Math.max(1, Math.round(seconds / 60)), "minute")
  if (seconds < 86400) return relative.format(-Math.round(seconds / 3600), "hour")
  return relative.format(-Math.round(seconds / 86400), "day")
}
