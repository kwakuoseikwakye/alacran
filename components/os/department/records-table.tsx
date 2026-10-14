"use client"

import { useState, useMemo } from "react"
import { CreateRecordButton } from "./create-record-button"

export type ColumnDef<T> = {
  header: string
  accessor: (item: T) => React.ReactNode
  sortKey?: (item: T) => string | number
  className?: string
}

const SUPPORTED_RECORD_DEPARTMENTS = ["funnel", "finances", "content"]

export function RecordsTable<T extends { id: string }>({
  records,
  columns,
  emptyMessage = "No records found in company records/ folder.",
  recordPath,
  departmentName,
  companyId,
}: {
  records: T[]
  columns: ColumnDef<T>[]
  emptyMessage?: string
  recordPath: string
  departmentName?: string
  companyId?: string
}) {
  const [search, setSearch] = useState("")

  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records
    const q = search.toLowerCase()
    return records.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
  }, [records, search])

  if (records.length === 0) {
    return (
      <div className="p-8 text-center rounded border border-border/80 bg-card/20 space-y-3">
        <p className="text-sm font-medium text-foreground">Honest Empty State</p>
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        {departmentName &&
        companyId &&
        SUPPORTED_RECORD_DEPARTMENTS.includes(departmentName.toLowerCase()) ? (
          <div className="pt-1">
            <CreateRecordButton
              departmentName={departmentName}
              companyId={companyId}
              variant="empty-state"
            />
          </div>
        ) : null}
        <p className="text-[11px] text-muted-foreground/80 font-mono">
          File path: {recordPath}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Filter records..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-xs rounded border border-border bg-muted/20 text-foreground w-64 focus:outline-none focus:border-primary font-mono"
        />
        <span className="text-xs text-muted-foreground font-mono">
          Showing {filteredRecords.length} of {records.length} records
        </span>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-mono text-muted-foreground">
              {columns.map((col, idx) => (
                <th key={idx} className={`px-3 py-2 font-medium ${col.className ?? ""}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredRecords.map((item) => (
              <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                {columns.map((col, idx) => (
                  <td key={idx} className={`px-3 py-2 text-foreground ${col.className ?? ""}`}>
                    {col.accessor(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
