"use client"

import { useEffect, useState } from "react"
import { AddCompanyForm } from "@/components/add-company-form"
import { checkDependencies } from "@/lib/check-dependencies"
import type { DependencyStatus } from "@/lib/check-dependencies-impl"

function DepRow({ label, ok, guidance }: { label: string; ok: boolean | undefined; guidance: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="font-medium">{label}</span>
      {ok === undefined ? (
        <span className="text-muted-foreground">checking…</span>
      ) : ok ? (
        <span className="text-muted-foreground">✓ installed</span>
      ) : (
        <span className="max-w-xs text-right text-destructive">{guidance}</span>
      )}
    </div>
  )
}

export function OnboardingWelcome() {
  const [deps, setDeps] = useState<DependencyStatus | null>(null)

  useEffect(() => {
    checkDependencies().then(setDeps)
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6 py-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Welcome — set up your AI company</h1>
        <p className="text-sm text-muted-foreground">
          Create your first company from the built-in template, then connect your own AI agent to run it.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">You&apos;ll need these installed first:</p>
        <DepRow
          label="Claude Code CLI"
          ok={deps?.claude}
          guidance="Install Claude Code, then reopen this app"
        />
        <DepRow
          label="gog (Google CLI)"
          ok={deps?.gog}
          guidance="Install gog to connect Gmail / Calendar later"
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Then{" "}
        <a className="text-primary underline underline-offset-4" href="/connect">
          connect your tools →
        </a>{" "}
        so your company can act on your behalf.
      </p>

      <AddCompanyForm />
    </div>
  )
}
