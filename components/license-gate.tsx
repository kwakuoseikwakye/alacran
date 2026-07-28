"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { activateLicense } from "@/lib/license/license-actions"
import { APP_NAME, PRICE_LABEL, CHECKOUT_URL } from "@/lib/branding"

export function LicenseGate({ reason }: { reason?: string }) {
  const router = useRouter()
  const [key, setKey] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(reason ?? null)

  async function handleActivate() {
    setPending(true)
    setMessage(null)
    const res = await activateLicense(key)
    setPending(false)
    if (res.ok) {
      router.refresh()
    } else {
      setMessage(res.message)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Activate {APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">
          Enter the license key from your purchase email to unlock the app.
        </p>
      </div>
      <div className="space-y-2">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          disabled={pending}
        />
        <Button onClick={handleActivate} disabled={pending || !key.trim()}>
          {pending ? "Activating…" : "Activate"}
        </Button>
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Don&apos;t have a key?{" "}
        <a className="underline" href={CHECKOUT_URL} target="_blank" rel="noreferrer">
          Get {APP_NAME}
        </a>{" "}
        — {PRICE_LABEL}.
      </p>
    </div>
  )
}
