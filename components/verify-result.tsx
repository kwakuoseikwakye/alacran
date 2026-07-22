import { Badge } from "@/components/ui/badge"
import type { VerifyRow } from "@/lib/run-verify-impl"

const STATUS_ORDER: Record<VerifyRow["status"], number> = { FAIL: 0, WARN: 1, INFO: 2, PASS: 3 }

export function VerifyResultList({ rows }: { rows: VerifyRow[] }) {
  const sorted = [...rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  return (
    <div className="space-y-2">
      {sorted.map((row) => (
        <div key={`${row.category}-${row.id}`} className="flex items-start gap-2 text-sm">
          <Badge variant={row.status === "FAIL" ? "destructive" : "outline"}>{row.status}</Badge>
          <div>
            <p className="font-medium">
              {row.category} · {row.id}
            </p>
            <p className="text-muted-foreground">{row.message}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
