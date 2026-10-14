"use client"

import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { InstallButton, SignInButton } from "@/components/connect-panel"
import type { ToolStatus } from "@/lib/connect/connect-status-impl"

/**
 * Shown on Home in place of the first-run welcome while the company's AI can't
 * answer yet. Before this, Home's main button sent a new user to ask a question
 * that could only fail. The fix is the same buttons the setup screen uses.
 */
export function AiSetupCard({ status }: { status: ToolStatus }) {
  const router = useRouter()
  const installed = !status.installId
  return (
    <section className="home-first-welcome" aria-labelledby="ai-setup-title">
      <span className="home-first-welcome-icon"><Sparkles aria-hidden /></span>
      <div>
        <p>One step left</p>
        <h2 id="ai-setup-title">{installed ? `Sign in to ${status.label}` : `Install ${status.label} to get answers`}</h2>
        <span>
          {installed
            ? "It's installed but not signed in, so it can't answer yet. Signing in opens your browser once."
            : "It's the AI that does the work. It needs a paid Claude plan (Pro is about $20 a month)."}
        </span>
      </div>
      {status.installId ? (
        <InstallButton id={status.installId} onDone={() => router.refresh()} />
      ) : status.needsSignIn ? (
        <SignInButton executorId={status.id} />
      ) : null}
    </section>
  )
}
