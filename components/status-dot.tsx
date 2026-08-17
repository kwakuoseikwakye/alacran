import type { ActivityStatus } from "@/lib/adapters/types"

export function StatusDot({ status }: { status: ActivityStatus }) {
  // Every adapter hardcodes "done" (lib/adapters/*), so there is one colour.
  // Widen ActivityStatus first if an adapter ever reports something else.
  void status
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
}
