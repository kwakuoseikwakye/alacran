"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlacranMark } from "@/components/alacran-mark"
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
    <div className="relative mx-auto flex min-h-[80vh] max-w-md flex-col justify-center gap-6 overflow-x-clip p-8">
      <div className="a-glow" aria-hidden="true" />
      <div className="a-rise relative space-y-2 text-center">
        <AlacranMark className="a-float mx-auto w-20" glow priority />
        <p className="eyebrow">Licence</p>
        <h1 className="font-display text-3xl font-extrabold">Activate {APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">
          Enter the license key from your purchase email to unlock the app.
        </p>
      </div>
      <div className="a-rise relative space-y-2" style={{ "--d": "120ms" } as React.CSSProperties}>
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          disabled={pending}
        />
        <Button
          onClick={handleActivate}
          disabled={pending || !key.trim()}
          className="w-full shadow-[0_8px_26px_-10px_var(--primary)]"
        >
          {pending ? "Activating…" : "Activate"}
        </Button>
        {message && <p className="text-xs text-destructive">{message}</p>}
      </div>
      <p
        className="a-rise relative text-center text-xs text-muted-foreground"
        style={{ "--d": "220ms" } as React.CSSProperties}
      >
        Don&apos;t have a key?{" "}
        <a className="underline" href={CHECKOUT_URL} target="_blank" rel="noreferrer">
          Get {APP_NAME}
        </a>{" "}
        — {PRICE_LABEL}.
      </p>
    </div>
  )
}
