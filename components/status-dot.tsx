export function StatusDot() {
  // One colour, because every adapter hardcodes status "done" (lib/adapters/*).
  // Give this a prop again if an adapter ever reports something else.
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
}
