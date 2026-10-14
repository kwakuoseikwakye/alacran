"use client"

import { useEffect, useState } from "react"
import { RefreshCw, ArrowUpCircle, ExternalLink, RotateCcw, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SectionTabs } from "@/components/section-tabs"
/**
 * One settings section. Replaces the Card each of these used to be: a settings
 * page is a document you scan, and five bordered boxes stacked in a column give
 * every heading the same weight as every other while adding four edges nobody
 * reads. The index beside them is plain anchors — a native platform feature
 * that needs no state and keeps the browser's own back button working.
 */
function Section({ id, title, children }: { id: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="a-rise">
      <h3 className="font-display text-base font-bold">{title}</h3>
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  )
}

/** One boxed setting — a label/description pair on the left, one control on
 *  the right. Matches the reviewed workspace prototype's `.opt` row instead
 *  of loose, unboxed lines: a page of toggles reads faster when each one has
 *  an edge to click inside of. */
function Row({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="native-setting-row">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "assistant", label: "Assistant" },
  { id: "voice", label: "Voice" },
  { id: "advanced", label: "Advanced" },
  { id: "updates", label: "Updates" },
  { id: "local", label: "On this computer" },
  { id: "about", label: "Help & about" },
]
import { CommandLine } from "@/components/copy-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { VoiceSettingsSection } from "@/components/voice-settings-section"
import { PersonaForm } from "@/components/assistant/persona-setup"
import type { AssistantPersona } from "@/lib/assistant/persona"
import type { VoiceProviderId } from "@/lib/voice/providers"
import {
  listAiExecutors,
  DEFAULT_AI_EXECUTOR_ID,
  type AiExecutorId,
} from "@/lib/ai-executors"
import { saveAssistantExecutor, saveAutoDispatch } from "@/lib/voice/voice-actions"
import { readMicEnabled, requestMicAccess, setMicEnabled, useMicEnabled } from "@/lib/voice/mic-preference"
import { setClapWake, useClapWake } from "@/lib/voice/clap-preference"
import { readAdvancedMode, setAdvancedMode } from "@/components/advanced-only"
import { desktopLogin } from "@/lib/desktop-login"
import { checkForUpdatesNow, performUpdate, restartApp } from "@/lib/updates/update-actions"
import { waitForServerThenReload } from "@/lib/updates/wait-for-server-then-reload"
import { desktopUpdater, type DesktopUpdater } from "@/lib/updates/desktop-updater"
import { RELEASE_PAGE_URL } from "@/lib/updates/fetch-latest-release-impl"
import { openChangelogModal } from "@/lib/updates/changelog-event"
import type { ManualCheckResult } from "@/lib/updates/check-for-updates-now-impl"


/** The card-order flag v50's drag-and-drop grid writes — a per-browser
 *  localStorage value with no other UI path to clear it. */
const CARD_ORDER_KEY = "alacran-card-order"

function UpdatesSection({ currentVersion, canAutoUpdate }: { currentVersion: string; canAutoUpdate: boolean }) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ManualCheckResult | null>(null)
  const [updatePhase, setUpdatePhase] = useState<"idle" | "updating" | "restarting" | "error">("idle")
  const [updateError, setUpdateError] = useState<{ message: string; manualCommand?: string } | null>(null)
  // Runtime-only, so it cannot be a prop: the mac shell publishes its updater
  // on window after the server has already rendered. See desktop-updater.ts.
  const [desktop, setDesktop] = useState<DesktopUpdater | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  useEffect(() => setDesktop(desktopUpdater()), [])

  async function check() {
    setPending(true)
    try {
      setResult(await checkForUpdatesNow())
    } finally {
      setPending(false)
    }
  }

  async function updateAndRestart() {
    setUpdatePhase("updating")
    setUpdateError(null)

    // On mac the whole update lives in the shell: it downloads the .zip its
    // own release manifest names, swaps the bundle and relaunches. Nothing
    // here restarts the server or reloads the page, because the process this
    // page is running in is the one going away.
    if (desktop) {
      const stop = desktop.onProgress(setPercent)
      const outcome = await desktop.install()
      stop()
      if (!outcome.ok) {
        setUpdatePhase("error")
        setUpdateError({ message: outcome.error ?? "The update could not be downloaded." })
        return
      }
      setUpdatePhase("restarting")
      return
    }

    const outcome = await performUpdate()
    if (!outcome.ok) {
      setUpdatePhase("error")
      setUpdateError({ message: outcome.message, manualCommand: outcome.manualCommand })
      return
    }
    setUpdatePhase("restarting")
    void restartApp()
    void waitForServerThenReload()
  }

  return (
    <Section
      id="updates"
      title={
        <span className="flex items-center gap-2">
          <ArrowUpCircle className="size-4 text-primary" /> Updates
        </span>
      }
    >
        <Row
          title={`You're on version ${currentVersion}`}
          description={result?.checked === true && !result.available ? "Up to date" : undefined}
        >
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openChangelogModal()}
              className="text-xs text-muted-foreground"
            >
              <Sparkles className="size-3.5 mr-1.5 text-primary" />
              View Changelog
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={check} disabled={pending}>
              <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
              {pending ? "Checking…" : "Check for updates"}
            </Button>
          </div>
        </Row>

        {result?.checked === false && result.reason === "disabled" && (
          <p className="text-xs text-muted-foreground">
            Update checks only run in a packaged build, not this development server.
          </p>
        )}
        {result?.checked === false && result.reason === "offline" && (
          <p className="text-xs text-destructive">Couldn&apos;t reach the update server. Check your connection and try again.</p>
        )}
        {result?.checked === true && result.available && updatePhase !== "restarting" && (
          <div className="space-y-2 rounded-md border border-border bg-background/60 p-3 text-sm">
            <p>
              Version <span className="font-semibold">{result.latestVersion}</span> is available.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                size="sm"
                onClick={() => openChangelogModal()}
                className="bg-primary text-primary-foreground font-semibold"
              >
                <Sparkles className="size-3.5 mr-1.5" />
                Update app
              </Button>
              {(canAutoUpdate || desktop) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={updateAndRestart}
                  disabled={updatePhase === "updating"}
                >
                  {updatePhase === "updating"
                    ? percent === null
                      ? "Downloading & installing…"
                      : `Downloading ${percent}%…`
                    : "Direct update & restart"}
                </Button>
              )}
              {/* Kept as a secondary way out for anyone whose install cannot
                  replace itself, but it is no longer the only offer on mac. */}
              <a
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                href={RELEASE_PAGE_URL}
                target="_blank"
                rel="noreferrer"
              >
                Download it <ExternalLink className="size-3" />
              </a>
            </div>
            {updatePhase === "error" && updateError && (
              <div className="space-y-1.5 text-xs text-destructive">
                <span>{updateError.message}</span>
                {updateError.manualCommand && <CommandLine command={updateError.manualCommand} />}
              </div>
            )}
          </div>
        )}
      {updatePhase === "restarting" && (
        <p className="text-xs text-muted-foreground">Update installed, restarting…</p>
      )}
    </Section>
  )
}

function ResetButton({ storageKey, label, doneLabel }: { storageKey: string; label: string; doneLabel: string }) {
  const [done, setDone] = useState(false)
  return (
    <Row title={label} description={done ? doneLabel : undefined}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          window.localStorage.removeItem(storageKey)
          setDone(true)
        }}
      >
        <RotateCcw className="size-3.5" /> Reset
      </Button>
    </Row>
  )
}

/**
 * The one switch that turns the terminal-literate half of the app back on.
 *
 * Off by default. Everything it reveals — the Network map, MCP connectors,
 * Open in Terminal, Notion, the company path
 * field — is either meaningless or actively confusing to someone who has
 * never used a terminal, which is who this app is for now.
 */
function AdvancedModeSection() {
  // Matches readAdvancedMode's default, so the switch does not render off for a
  // frame and then flip on.
  const [on, setOn] = useState(true)
  useEffect(() => setOn(readAdvancedMode()), [])

  return (
    <Section id="advanced" title="Advanced mode">
      <p className="text-sm text-muted-foreground">
        Shows the extra tools: the network map, MCP connectors, opening a company in a terminal, other AI agents,
        Notion, and choosing where a company&apos;s folder lives. New installs start with it off. Nothing here is
        needed for day-to-day use, and switching it never changes what your companies can do.
      </p>
      <Row title="Advanced mode" description={on ? "On" : "Off"}>
        <Switch
          checked={on}
          onCheckedChange={(checked) => {
            setOn(checked)
            setAdvancedMode(checked)
          }}
          aria-label="Advanced mode"
        />
      </Row>
    </Section>
  )
}

/**
 * Wake the Assistant with two claps. Its own switch, off by default, and unavailable until the
 * microphone switch above is on: waiting for a clap means the microphone stays open while the Assistant
 * is idle, so the copy says exactly that rather than "listens for a clap" as if it were free.
 */
function ClapWakeRow() {
  const micOn = useMicEnabled()
  const on = useClapWake()
  return (
    <Row
      title="Wake with a double clap"
      description={
        !micOn
          ? "Turn on the microphone first"
          : on
            ? "On — after you stop the microphone, the Assistant keeps it open and starts listening when you clap twice. Your computer's microphone light stays on meanwhile. Nothing is recorded."
            : "Off — press the core to start listening again"
      }
    >
      <Switch checked={on && micOn} disabled={!micOn} onCheckedChange={setClapWake} aria-label="Wake with a double clap" />
    </Row>
  )
}

/**
 * The Assistant's microphone, off until turned on here. Turning it on is the
 * one moment the app asks for the microphone; a refusal leaves it off and
 * says where to allow it, rather than a switch that claims "on" and hears
 * nothing.
 */
function MicrophoneRow() {
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useEffect(() => setOn(readMicEnabled()), [])

  async function change(checked: boolean) {
    setNote(null)
    if (!checked) {
      setOn(false)
      setMicEnabled(false)
      return
    }
    setBusy(true)
    const answer = await requestMicAccess()
    setBusy(false)
    if (answer === "granted") {
      setOn(true)
      setMicEnabled(true)
    } else {
      setNote("Alacrán wasn't allowed to use the microphone. Allow it under System Settings › Privacy & Security › Microphone, then turn this on again.")
    }
  }

  return (
    <>
      <Row
        title="Use the microphone"
        description={busy ? "Asking for the microphone…" : on ? "On — the Assistant listens when you open it" : "Off — type your questions instead"}
      >
        <Switch checked={on} disabled={busy} onCheckedChange={(checked) => void change(checked)} aria-label="Use the microphone" />
      </Row>
      {note && (
        <p className="text-xs text-muted-foreground" role="status">
          {note}
        </p>
      )}
    </>
  )
}

function AssistantExecutorSetting({ initialExecutorId }: { initialExecutorId: AiExecutorId }) {
  const [value, setValue] = useState<AiExecutorId>(initialExecutorId)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleChange(next: string) {
    const prev = value
    const nextId = next as AiExecutorId
    setValue(nextId)
    setSaving(true)
    setStatus(null)
    const result = await saveAssistantExecutor(nextId)
    setSaving(false)
    if (result.ok) {
      setStatus("Saved.")
    } else {
      setValue(prev)
      setStatus(result.message)
    }
  }

  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <Row
        title="AI for the Assistant"
        description="Used by the voice Assistant and for questions across all your companies. Each company's own work uses the AI chosen on its Company profile."
      >
        <select
          value={value}
          disabled={saving}
          onChange={(e) => void handleChange(e.target.value)}
          className="flex h-9 min-w-44 rounded-md border border-os-border bg-os-surface px-3 py-1 text-xs text-os-text shadow-xs transition-colors outline-none focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="AI agent for assistant"
        >
          {listAiExecutors().map((option) => (
            <option key={option.id} value={option.id} className="bg-os-surface text-os-text">
              {option.label}
            </option>
          ))}
        </select>
      </Row>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}

function AutoDispatchSetting({ companies, initial }: { companies: { id: string; name: string }[]; initial: string[] }) {
  const [on, setOn] = useState<ReadonlySet<string>>(() => new Set(initial))
  const [status, setStatus] = useState<string | null>(null)

  async function toggle(id: string, enabled: boolean) {
    setOn((s) => {
      const next = new Set(s)
      if (enabled) next.add(id)
      else next.delete(id)
      return next
    })
    setStatus(null)
    const result = await saveAutoDispatch(id, enabled)
    if (result.ok) setStatus("Saved.")
    else {
      setOn((s) => {
        const n = new Set(s)
        if (enabled) n.delete(id)
        else n.add(id)
        return n
      })
      setStatus(result.message)
    }
  }

  if (companies.length === 0) return null
  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <Row
        title="Send spoken tasks to my agent without asking"
        description="When on for a company, a task you speak is read back and typed into that company's open agent after 5 seconds, unless you say cancel or press Esc. It types into your open agent and presses Enter, so if your agent is waiting for you to answer a question, answer it first. Tasks that mention money, contracts, deleting, publishing or access still wait for your click. The check looks for words, so listen to the read-back before it sends. Off means every spoken task waits for your click. Press Update agent in Settings once after turning this on."
      >
        <div className="flex flex-col gap-1.5">
          {companies.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-xs text-os-text" title={`Send ${c.name}'s spoken tasks to its agent after a 5-second cancel window`}>
              <input type="checkbox" checked={on.has(c.id)} onChange={(e) => void toggle(c.id, e.target.checked)} aria-label={`Send ${c.name}'s spoken tasks without asking`} />
              {c.name}
            </label>
          ))}
        </div>
      </Row>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}

export function SettingsPanel({
  currentVersion,
  canAutoUpdate,
  voiceProviderId,
  voiceHasKey,
  elevenlabsAgentReady,
  elevenlabsAgentOutdated = false,
  elevenlabsVoiceId,
  persona,
  assistantExecutorId = DEFAULT_AI_EXECUTOR_ID,
  companies = [],
  autoDispatchCompanies = [],
}: {
  currentVersion: string
  canAutoUpdate: boolean
  voiceProviderId: VoiceProviderId
  voiceHasKey: boolean
  elevenlabsAgentReady: boolean
  elevenlabsAgentOutdated?: boolean
  elevenlabsVoiceId: string | null
  persona: AssistantPersona | null
  assistantExecutorId?: AiExecutorId
  companies?: { id: string; name: string }[]
  autoDispatchCompanies?: string[]
}) {
  return (
    <div className="preferences-native">
      {/* Plain anchors, sticky. No state, no router, and the browser's own
          back button keeps working. */}
      <SectionTabs className="preferences-toolbar" items={SECTIONS} />

      <div className="preferences-content">
        <Section id="appearance" title="Appearance">
          <p className="text-sm text-muted-foreground">Choose how Alacrán looks. It changes straight away.</p>
          <ThemeToggle />
        </Section>

        {/* The same form the Assistant page shows on first run. It is here so
            the answers are changeable afterwards — v72's rule is that a thing
            already in use must stay reachable, and a name you can set once and
            never edit is the same trap from the other end. */}
        <Section id="assistant" title="Assistant">
          <p className="text-sm text-muted-foreground">
            What you call each other, the languages you each speak, and the voice it answers in. Used by the
            Assistant page and by &ldquo;Ask&rdquo; on any company.
          </p>
          <PersonaForm initial={persona} submitLabel="Save" />
          <AssistantExecutorSetting initialExecutorId={assistantExecutorId} />
          <AutoDispatchSetting companies={companies} initial={autoDispatchCompanies} />
        </Section>

        <Section id="voice" title="Voice">
          <p className="text-sm text-muted-foreground">
            Speaking to the Assistant sends your voice somewhere to be turned into words. This is where you choose
            where, and it is the one part of Alacrán that leaves your machine without you pressing Run.
          </p>
          <MicrophoneRow />
          <ClapWakeRow />
          <VoiceSettingsSection
            initialProviderId={voiceProviderId} initialHasKey={voiceHasKey}
            initialAgentReady={elevenlabsAgentReady}
            initialAgentOutdated={elevenlabsAgentOutdated}
            initialVoiceId={elevenlabsVoiceId}
          />
        </Section>

        <AdvancedModeSection />

        <UpdatesSection currentVersion={currentVersion} canAutoUpdate={canAutoUpdate} />

        <Section id="local" title="On this computer">
          <LaunchAtLoginRow />
          <ResetButton
            storageKey={CARD_ORDER_KEY}
            label="Reset company order"
            doneLabel="Done — the Companies page uses its default order again."
          />
        </Section>

        <Section id="about" title="Help & about">
          <p className="text-sm text-muted-foreground">
            Version {currentVersion} · no account, no telemetry. Your companies&apos; files stay on this
            computer; when you ask something, the relevant part is sent to the AI you&apos;ve connected so it can
            answer.
          </p>
          <div className="flex flex-wrap gap-4 pt-1">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              onClick={() => openChangelogModal()}
            >
              What&apos;s new in this version
            </button>
            <a
              href="https://github.com/kwakuoseikwakye/alacran"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Source on GitHub (MIT licence)
            </a>
          </div>
          <CopySupportDetails version={currentVersion} />
        </Section>
      </div>
    </div>
  )
}

/**
 * There was no help path in the app at all. This gives a stuck user something
 * useful to paste into a message: what they're running and where, nothing
 * about their companies or files.
 */
function CopySupportDetails({ version }: { version: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    const details = [
      `Alacrán ${version}`,
      `System: ${navigator.userAgent}`,
      `Advanced mode: ${readAdvancedMode() ? "on" : "off"}`,
      `Page: ${window.location.pathname}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n")
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="space-y-1 pt-2">
      <p className="text-sm text-muted-foreground">
        Stuck? Copy these details and send them with your question. They say which version you&apos;re running and
        on what, and nothing about your companies.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
      >
        {copied ? "Copied" : "Copy details for support"}
      </button>
    </div>
  )
}

/**
 * Scheduled jobs only run while Alacrán is open, and people quit apps at night.
 * Shown only inside a mac shell that has the bridge — detected in an effect,
 * because reading `window` during render mismatches hydration.
 */
function LaunchAtLoginRow() {
  const [available, setAvailable] = useState(false)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const login = desktopLogin()
    if (!login) return
    setAvailable(true)
    login.get().then(setOn).catch(() => setAvailable(false))
  }, [])
  if (!available) return null
  return (
    <Row title="Open Alacrán when you log in" description="Scheduled jobs only run while Alacrán is open.">
      <Switch
        checked={on}
        onCheckedChange={(checked) => {
          const login = desktopLogin()
          if (!login) return
          setOn(checked)
          login.set(checked).then(setOn).catch(() => setOn(!checked))
        }}
        aria-label="Open Alacrán when you log in"
      />
    </Row>
  )
}
