"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { VerifyResultList } from "@/components/verify-result"
import { runVerify } from "@/lib/run-verify"
import type { VerifyResult } from "@/lib/run-verify-impl"

export function VerifyButton() {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  async function handleRun() {
    setPending(true)
    const nextResult = await runVerify()
    setPending(false)
    setResult(nextResult)
  }

  const summary = result
    ? (() => {
        const counts: Record<string, number> = { PASS: 0, WARN: 0, FAIL: 0, INFO: 0 }
        for (const row of result.rows) counts[row.status] = (counts[row.status] ?? 0) + 1
        return `${counts.PASS} passed · ${counts.INFO} info · ${counts.WARN} warn · ${counts.FAIL} failed`
      })()
    : null

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={handleRun} disabled={pending}>
        {pending ? "Running…" : "Run verify"}
      </Button>
      {result && !result.ran && <p className="text-xs text-destructive">{result.message}</p>}
      {result && result.ran && (
        <p className={`text-xs ${result.passed ? "text-muted-foreground" : "text-destructive"}`}>
          {summary}{" "}
          <button className="underline" onClick={() => setDetailsOpen(true)}>
            View details
          </button>
        </p>
      )}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Verify results</SheetTitle>
          </SheetHeader>
          <div className="h-[80vh] overflow-y-auto pr-4">{result && <VerifyResultList rows={result.rows} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
