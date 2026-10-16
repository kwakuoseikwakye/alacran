"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { markFlagHandledAction } from "@/lib/jobs/actions"
import type { OpenFlag } from "@/lib/jobs/view"

/**
 * What unattended jobs couldn't decide, one row each. Used on the Jobs page and in Approvals, which is where the owner
 * already looks. "Mark handled" only clears the row; acting on it (a call, a fix) is the person's job.
 */
export function JobFlagList({ companyId, flags, linkToJobs = false }: { companyId: string; flags: OpenFlag[]; linkToJobs?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <ul className="space-y-2">
      {flags.map((flag) => (
        <li key={flag.key} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-os-border bg-os-surface p-3">
          <div className="min-w-0 text-sm">
            <p className="text-os-text">
              <b>{flag.item}</b>: {flag.reason}
            </p>
            <p className="text-os-dim">
              From {flag.jobId}, {flag.date}
              {linkToJobs && (
                <>
                  {" · "}
                  <Link href={`/c/${companyId}/jobs`} className="underline" title="Open Unattended jobs">
                    See the job
                  </Link>
                </>
              )}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            title="Clear this from the list once you've dealt with it. It doesn't change anything else."
            onClick={() =>
              start(async () => {
                await markFlagHandledAction(companyId, flag.key)
                router.refresh()
              })
            }
          >
            Mark handled
          </Button>
        </li>
      ))}
    </ul>
  )
}
