"use client"

import React, { useState } from "react"
import {
  X,
  RefreshCw,
  Shield,
  CheckCircle2,
  AlertCircle,
  Laptop,
  Download,
  Loader2,
  Chrome,
  ExternalLink,
} from "lucide-react"
import { BrandLogo } from "@/lib/os/connectors/brand-logos"
import { Button } from "@/components/ui/button"
import { CommandLine } from "@/components/copy-button"
import { OutlookSetup } from "@/components/os/connectors/outlook-setup"
import { ConnectGoogleApps, GoogleSetup, InstallButton, KeychainNote, SignInButton } from "@/components/connect-panel"
import { openChromePairing } from "@/lib/setup-google"
import { installTool } from "@/lib/install-tool"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"
import type { InstallableId } from "@/lib/install-tool-impl"

export function MachineSetupModal({
  open,
  onClose,
  slug,
  name,
  connectStatus,
  onRecheck,
}: {
  open: boolean
  onClose: () => void
  slug: string
  name: string
  connectStatus?: ConnectStatus
  onRecheck?: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<"success" | "error" | null>(null)

  // Install State
  const [installBusy, setInstallBusy] = useState(false)
  const [installLog, setInstallLog] = useState<string | null>(null)

  if (!open) return null

  const handleRecheck = async () => {
    if (!onRecheck || checking) return
    setChecking(true)
    setCheckResult(null)
    try {
      await onRecheck()
      setCheckResult("success")
    } catch {
      setCheckResult("error")
    } finally {
      setChecking(false)
    }
  }

  const handleSaveKey = async (keyName: string, value: string) => {
    setBusy(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch("/api/connections/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          values: { [keyName]: value },
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (!data.ok) throw new Error(data.error ?? "Failed to save key")
      setSaveSuccess(true)
      await handleRecheck()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save key")
    } finally {
      setBusy(false)
    }
  }

  const handleInstall = async (toolId: InstallableId) => {
    setInstallBusy(true)
    setInstallLog(null)
    try {
      const res = await installTool(toolId)
      if (res.ok) {
        await handleRecheck()
      } else {
        setInstallLog(res.log || "Install failed")
      }
    } catch (e) {
      setInstallLog(e instanceof Error ? e.message : "Install error")
    } finally {
      setInstallBusy(false)
    }
  }

  const claudeTool = connectStatus?.aiExecutors.find((e) => e.id === "claude-code")
  const executor = connectStatus?.aiExecutors.find((e) => e.id === (slug === "antigravity" ? "google-antigravity" : slug))
  const google = connectStatus?.google

  return (
    <div role="dialog" aria-modal="true" aria-label={`${name} setup`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
      {/* Header and footer stay put; only the body scrolls, so a long setup never pushes Close off screen. */}
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-5 overflow-hidden rounded-2xl border border-os-border bg-os-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-os-border pb-4">
          <div className="flex items-center gap-3">
            <BrandLogo slug={slug} name={name} size={36} />
            <div>
              <h2 className="text-base font-semibold text-os-text">{name}</h2>
              <p className="text-xs text-os-dim">
                Machine & CLI integration &bull; Local-first execution
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-os-dim transition-colors hover:bg-os-surface2 hover:text-os-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {/* CLAUDE CODE */}
        {slug === "claude-code" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Status</span>
                {claudeTool?.connected ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected &amp; authenticated
                  </span>
                ) : claudeTool?.needsSignIn ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-warn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Installed, sign-in required
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-dim">
                    <Laptop className="h-3.5 w-3.5" />
                    Not installed on PATH
                  </span>
                )}
              </div>
            </div>

            <p className="text-xs text-os-dim">
              Claude Code is Anthropic&apos;s agentic CLI for full-stack engineering. It runs directly on your machine to execute tasks and commits.
            </p>

            {!claudeTool?.connected && (
              <div className="space-y-3 rounded-xl border border-os-border bg-os-surface2/60 p-4">
                <h4 className="text-xs font-semibold text-os-text">Installation &amp; Setup</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void handleInstall("claude-code")}
                    disabled={installBusy}
                    className="h-7 text-xs"
                  >
                    {installBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {installBusy ? "Installing…" : "Install Claude Code for me"}
                  </Button>
                </div>
                <p className="text-[11px] text-os-dim">Or install via terminal:</p>
                <CommandLine command="curl -fsSL https://claude.ai/install.sh | bash" />
                <p className="text-[11px] text-os-dim">Then authenticate your CLI session:</p>
                <CommandLine command="claude login" />
                {installLog && (
                  <pre className="max-h-32 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] text-os-dim">
                    {installLog}
                  </pre>
                )}
              </div>
            )}

            {claudeTool?.connected && (
              <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-4 text-xs">
                <p className="text-os-ok font-medium">Ready for autonomous workflows</p>
                <p className="text-os-dim text-[11px]">
                  Claude Code is signed in and ready. Company commands and coding subagents will automatically run through this local executor.
                </p>
                <p className="text-[11px] text-os-dim pt-2">If you experience errors, run repair:</p>
                <CommandLine command="curl -fsSL https://claude.ai/install.sh | bash" />
              </div>
            )}

            {/* Optional ANTHROPIC_API_KEY in .env.local */}
            <div className="space-y-2 border-t border-os-border pt-3">
              <label className="block text-xs font-medium text-os-text">
                Override Anthropic API Key (optional)
              </label>
              <p className="text-[11px] text-os-dim">
                Saved into gitignored <code className="font-mono text-os-text">.env.local</code> for direct SDK access.
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="sk-ant-api..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 rounded-lg border border-os-border bg-os-surface2 px-2.5 py-1.5 font-mono text-xs text-os-text placeholder:text-os-dim focus:border-os-border-strong focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !apiKey.trim()}
                  onClick={() => void handleSaveKey("ANTHROPIC_API_KEY", apiKey)}
                  className="h-8 border-os-border bg-os-surface text-xs text-os-text"
                >
                  {busy ? "Saving…" : "Save Key"}
                </Button>
              </div>
              {saveSuccess && <p className="text-xs text-os-ok font-mono">Key saved to .env.local</p>}
              {saveError && <p className="text-xs text-os-err font-mono">{saveError}</p>}
            </div>
          </div>
        )}

        {/* GOOGLE CLOUD & WORKSPACE */}
        {slug === "google" && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">OAuth Status</span>
                {google?.connected ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected ({google.accounts?.length ?? 0} account(s))
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-warn">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Setup required
                  </span>
                )}
              </div>
              {google?.accounts && google.accounts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {google.accounts.map((acc) => (
                    <span
                      key={acc}
                      className="rounded bg-os-surface px-2 py-0.5 font-mono text-[10.5px] text-os-text"
                    >
                      {acc}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-os-dim">
              Google Workspace integration connects your mail, calendar, and drive via the open-source local <code className="font-mono text-os-text">gog</code> CLI. Connect once and all companies can read their mail and calendar. Add as many Google accounts as you use.
            </p>

            {/* The same account flow the old Connect page had: pick an account, add another,
                choose its apps, let the AI do the Google Cloud clicks. */}
            {google?.connected ? (
              <>
                <ConnectGoogleApps
                  accounts={google.accounts ?? []}
                  accountServices={google.accountServices}
                  claudeReady={claudeTool?.connected === true}
                />
                <KeychainNote />
              </>
            ) : (
              <div className="space-y-3">
                {google?.installId && <InstallButton id={google.installId} onDone={() => void handleRecheck()} />}
                {(google?.googleStage === "client" || google?.googleStage === "account") && (
                  <GoogleSetup
                    stage={google.googleStage}
                    claudeReady={claudeTool?.connected === true}
                    granted={google.grantedServices}
                  />
                )}
                <KeychainNote />
                {google && google.guidance.steps.length > 0 && (
                  <ol className="list-decimal space-y-1 pl-5 text-os-dim">
                    {google.guidance.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                {google?.guidance.command && <CommandLine command={google.guidance.command} />}
              </div>
            )}

            {/* Chrome Browser Agent Pairing */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-os-border bg-os-surface2/40 p-3.5">
              <div>
                <span className="font-semibold text-os-text flex items-center gap-1.5">
                  <Chrome className="h-3.5 w-3.5" />
                  Chrome Browser Agent Pairing
                </span>
                <p className="text-[11px] text-os-dim">
                  Pair local Chrome browser profile to allow automated agent web interaction.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void openChromePairing(google?.accounts?.[0] ?? "")}
                className="h-7 shrink-0 border-os-border bg-os-surface text-xs text-os-text hover:bg-os-surface2"
              >
                Pair Chrome
              </Button>
            </div>
          </div>
        )}

        {/* GITHUB */}
        {slug === "github" && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Status</span>
                {connectStatus?.github.connected ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected ({connectStatus.github.detail || "Active"})
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-dim">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not connected
                  </span>
                )}
              </div>
            </div>

            <p className="text-os-dim">
              Connect GitHub so autonomous agents can inspect repos, pull diffs, file issues, and create PRs. You can use your machine&apos;s <code className="font-mono text-os-text">gh</code> CLI or a personal access token.
            </p>

            {/* Method A: gh CLI */}
            <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
              <h4 className="font-semibold text-os-text">Method 1: GitHub CLI (Recommended)</h4>
              <p className="text-[11px] text-os-dim">
                If <code className="font-mono text-os-text">gh</code> is installed, authenticate directly in your terminal:
              </p>
              <CommandLine command="gh auth login" />
              <p className="text-[11px] text-os-dim">Verify active session:</p>
              <CommandLine command="gh api user --jq .login" />
            </div>

            {/* Method B: GITHUB_TOKEN */}
            <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
              <h4 className="font-semibold text-os-text">Method 2: Personal Access Token</h4>
              <p className="text-[11px] text-os-dim">
                Saved into gitignored <code className="font-mono text-os-text">.env.local</code> as <code className="font-mono text-os-text">GITHUB_TOKEN</code>.
              </p>
              <div className="flex gap-2 pt-1">
                <input
                  type="password"
                  placeholder="ghp_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 font-mono text-xs text-os-text placeholder:text-os-dim focus:outline-none"
                />
                <Button
                  size="sm"
                  disabled={busy || !apiKey.trim()}
                  onClick={() => void handleSaveKey("GITHUB_TOKEN", apiKey)}
                  className="h-8 text-xs"
                >
                  {busy ? "Saving…" : "Save Token"}
                </Button>
              </div>
              {saveSuccess && <p className="text-xs text-os-ok font-mono">Token saved to .env.local</p>}
              {saveError && <p className="text-xs text-os-err font-mono">{saveError}</p>}
            </div>
          </div>
        )}

        {/* BEEPER */}
        {slug === "outlook" && <OutlookSetup connectStatus={connectStatus} onRecheck={handleRecheck} />}

        {slug === "beeper" && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Bridge Status</span>
                {connectStatus?.beeper.connected ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Local bridge active (--read-only)
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-dim">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not installed on PATH
                  </span>
                )}
              </div>
            </div>

            <p className="text-os-dim">
              Beeper provides a single connection to every chat network your company uses. When present on the PATH, agents run <code className="font-mono text-os-text">/check-messages</code> to summarize chats across all networks.
            </p>

            <div className="rounded-xl border border-os-border bg-os-surface2/60 p-3.5 space-y-2">
              <span className="font-semibold text-os-text">Connected Chat Networks</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  "WhatsApp",
                  "iMessage",
                  "Signal",
                  "Slack",
                  "Telegram",
                  "Discord",
                  "LinkedIn",
                  "X",
                  "Instagram",
                  "Messenger",
                ].map((net) => (
                  <span
                    key={net}
                    className="rounded-md border border-os-border bg-os-surface px-2 py-0.5 font-mono text-[10.5px] text-os-text"
                  >
                    {net}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
              <span className="font-semibold text-os-text">Installation</span>
              <p className="text-[11px] text-os-dim">Install Beeper via Homebrew or the desktop app:</p>
              <CommandLine command="brew install beeper" />
            </div>

            <div className="rounded-xl border border-os-border bg-os-surface2/40 p-3 text-[11px] text-os-dim space-y-1">
              <span className="font-semibold text-os-text flex items-center gap-1">
                <Shield className="h-3 w-3 text-os-accent" /> Standing Safety Agreement (AGENTS.md &sect;7)
              </span>
              <p>
                Every call carries <code className="font-mono text-os-text">--read-only --json</code>. Agents never send messages on your behalf.
              </p>
            </div>
          </div>
        )}

        {/* NOTION */}
        {slug === "notion" && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Sync Status</span>
                {connectStatus?.notion.companies.some((c) => c.connected) ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Connected for {connectStatus.notion.companies.filter((c) => c.connected).length} company/companies
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-dim">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not connected
                  </span>
                )}
              </div>
            </div>

            <p className="text-os-dim">
              Notion connection powers <code className="font-mono text-os-text">/check-notion</code> to summarize workspace pages and project databases.
            </p>

            {/* Secret key in .env.local */}
            <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
              <span className="font-semibold text-os-text">Method 1: Global API Key (.env.local)</span>
              <p className="text-[11px] text-os-dim">
                Internal Integration Token created at notion.so/profile/integrations:
              </p>
              <div className="flex gap-2 pt-1">
                <input
                  type="password"
                  placeholder="secret_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 font-mono text-xs text-os-text placeholder:text-os-dim focus:outline-none"
                />
                <Button
                  size="sm"
                  disabled={busy || !apiKey.trim()}
                  onClick={() => void handleSaveKey("NOTION_API_KEY", apiKey)}
                  className="h-8 text-xs"
                >
                  {busy ? "Saving…" : "Save Key"}
                </Button>
              </div>
              {saveSuccess && <p className="text-xs text-os-ok font-mono">Saved to .env.local</p>}
              {saveError && <p className="text-xs text-os-err font-mono">{saveError}</p>}
            </div>

            {/* Company Secret Files */}
            <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
              <span className="font-semibold text-os-text">Method 2: Per-Company Secret File</span>
              <p className="text-[11px] text-os-dim">
                Place token in <code className="font-mono text-os-text">secrets/notion.txt</code> inside each company repository:
              </p>
              <div className="space-y-1.5 pt-1 font-mono text-[11px]">
                {connectStatus?.notion.companies.map((c) => (
                  <div key={c.agentId} className="flex items-center justify-between text-os-text">
                    <span>{c.companyName}</span>
                    <span className={c.connected ? "text-os-ok" : "text-os-dim"}>
                      {c.connected ? "Connected" : "No token"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CODEX / KIRO / KIMI / ANTIGRAVITY */}
        {(slug === "codex" || slug === "kiro" || slug === "kimi" || slug === "antigravity") && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-os-border bg-os-surface2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-os-dim uppercase tracking-wider text-[11px]">Status</span>
                {executor?.connected ? (
                  <span className="flex items-center gap-1.5 font-mono text-os-ok">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    CLI Engine Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-mono text-os-dim">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Not connected
                  </span>
                )}
              </div>
            </div>

            <p className="text-os-dim">
              Local AI execution engine. Runs tasks locally on your terminal without third-party cloud routing.
            </p>

            {/* The same assisted setup Claude Code gets, driven by the executor's own
                status (connect-status-impl) rather than hardcoded per slug, so a newly
                registered executor arrives with it too. */}
            {executor && !executor.connected && (
              <div className="space-y-3 rounded-xl border border-os-border bg-os-surface2/60 p-4">
                <h4 className="font-semibold text-os-text">Installation &amp; Setup</h4>
                {executor.installId && <InstallButton id={executor.installId} onDone={() => void handleRecheck()} />}
                {executor.needsSignIn && <SignInButton executorId={executor.id} />}
                {executor.guidance.steps.length > 0 && (
                  <ol className="list-decimal space-y-1 pl-5 text-os-dim">
                    {executor.guidance.steps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                {executor.guidance.command && (
                  <>
                    <p className="text-[11px] text-os-dim">{executor.installId ? "Or install via terminal:" : "Install via terminal:"}</p>
                    <CommandLine command={executor.guidance.command} />
                  </>
                )}
                {executor.guidance.link && (
                  <a
                    className="inline-flex items-center gap-1 text-[11px] text-os-accent underline-offset-4 hover:underline"
                    href={executor.guidance.link}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open ${name}'s own install instructions`}
                  >
                    Install instructions <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}

            {slug === "antigravity" && (
              <div className="space-y-2 rounded-xl border border-os-border bg-os-surface2/60 p-3.5">
                <span className="font-semibold text-os-text">Google Gemini API Key (.env.local)</span>
                <div className="flex gap-2 pt-1">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1 rounded-lg border border-os-border bg-os-surface px-2.5 py-1.5 font-mono text-xs text-os-text placeholder:text-os-dim focus:outline-none"
                  />
                  <Button
                    size="sm"
                    disabled={busy || !apiKey.trim()}
                    onClick={() => void handleSaveKey("GEMINI_API_KEY", apiKey)}
                    className="h-8 text-xs"
                  >
                    {busy ? "Saving…" : "Save Key"}
                  </Button>
                </div>
                {saveSuccess && <p className="text-xs text-os-ok font-mono">Saved to .env.local</p>}
                {saveError && <p className="text-xs text-os-err font-mono">{saveError}</p>}
              </div>
            )}
          </div>
        )}

        </div>

        {checkResult === "success" && <p role="status" className="text-xs text-os-ok">Status checked. Connection details are up to date.</p>}
        {checkResult === "error" && <p role="alert" className="text-xs text-os-err">Could not re-check connections. Please try again.</p>}

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-os-border pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 border-os-border bg-os-surface text-xs text-os-dim hover:text-os-text"
          >
            Close
          </Button>
          {onRecheck && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecheck}
              disabled={checking}
              className="h-8 border-os-border bg-os-surface text-xs text-os-text hover:bg-os-surface2"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Re-check status"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
