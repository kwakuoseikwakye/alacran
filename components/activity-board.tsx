"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity, ActivityStatus } from "@/lib/adapters/types"
import { getActivityDetail } from "@/lib/get-activity-detail"

const COLUMNS: { status: ActivityStatus; label: string }[] = [
  { status: "needs-attention", label: "Needs Attention" },
  { status: "done", label: "Done" },
  { status: "unknown", label: "Unknown" },
]

export function ActivityBoard({ activities }: { activities: Activity[] }) {
  const [selected, setSelected] = useState<Activity | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  async function openActivity(activity: Activity) {
    setSelected(activity)
    setDetail(null)
    setDetailError(null)
    try {
      const content = await getActivityDetail(activity.detailPath)
      setDetail(content)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column.status} className="space-y-2">
            <h2 className="font-medium">{column.label}</h2>
            {activities
              .filter((a) => a.status === column.status)
              .map((activity) => (
                <Card key={activity.id} className="cursor-pointer" onClick={() => openActivity(activity)}>
                  <CardHeader className="p-3">
                    <CardTitle className="text-sm font-medium">{activity.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 text-xs text-muted-foreground">
                    {new Date(activity.timestamp * 1000).toLocaleString()}
                  </CardContent>
                </Card>
              ))}
          </div>
        ))}
      </div>
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selected?.title}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[80vh] pr-4">
            {detailError && <p className="text-destructive">{detailError}</p>}
            {!detailError && <pre className="whitespace-pre-wrap text-sm">{detail ?? "Loading…"}</pre>}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
