import Link from "next/link"
import type { DepartmentConnector } from "./connector-status-strip"

export function DepartmentSettings({
  departmentName,
  connectors,
  owningAgent,
  recordFiles,
}: {
  departmentName: string
  connectors: DepartmentConnector[]
  owningAgent: string
  recordFiles: string[]
}) {
  return (
    <div className="max-w-2xl space-y-6 text-xs">
      <div className="p-4 rounded border border-border bg-card/30 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Department Configuration</h3>
        <p className="text-muted-foreground">
          {departmentName} is machine-maintained by autonomous department workflows.
          Data is stored in local plain YAML files under the company repository.
        </p>

        <div className="pt-2 border-t border-border/60 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Owning Agent:</span>
            <span className="font-mono text-foreground font-semibold">{owningAgent}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Data Storage:</span>
            <span className="font-mono text-muted-foreground">records/{departmentName.toLowerCase()}/</span>
          </div>
        </div>
      </div>

      <div className="p-4 rounded border border-border bg-card/30 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Configured Connectors</h3>
          <Link
            href="/system/connectors"
            className="text-primary hover:underline font-mono text-xs"
          >
            Manage Connectors →
          </Link>
        </div>
        <p className="text-muted-foreground">
          Connectors feeding real-time operational data into this department.
        </p>

        <div className="space-y-2 pt-2">
          {connectors.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between p-2.5 rounded border border-border/50 bg-muted/10 font-mono"
            >
              <span className="font-medium text-foreground">{c.label}</span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded capitalize ${
                  c.status === "connected"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : c.status === "error"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-muted/40 text-muted-foreground"
                }`}
              >
                {c.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded border border-border bg-card/30 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Tracked Record Files</h3>
        <ul className="space-y-1 font-mono text-muted-foreground">
          {recordFiles.map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-primary/60" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
