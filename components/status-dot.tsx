import type { ActivityStatus } from "@/lib/adapters/types"

const STATUS_DOT_CLASS: Record<ActivityStatus, string> = {
  done: "bg-success",
  "needs-attention": "bg-destructive",
  unknown: "bg-warning",
}

export function StatusDot({ status }: { status: ActivityStatus }) {
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
}
