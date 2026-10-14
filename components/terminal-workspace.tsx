"use client"

import { ExecutorGapNote } from "@/components/executor-gap-note"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BookmarkPlus, Bot, LayoutGrid, Layers, Maximize2, Pencil, Plus, Sparkles, Square, Terminal as TerminalIcon, X } from "lucide-react"
import { TERMINAL_STATUS_CHANGED_EVENT, type TerminalStatusChangedDetail } from "@/lib/terminal-panel-event"
// xterm positions its own rows; without this the terminal renders as a pile of
// unpositioned spans.
import "@xterm/xterm/css/xterm.css"

/** Type-only, so it is erased: xterm itself is imported dynamically (it touches
 *  `document` at module scope) and cannot be a static import in a file the
 *  server also has to parse. */
import type { Terminal as XTerm } from "@xterm/xterm"
import { createStreamHub, openEventSource } from "@/lib/terminal/stream-hub"
import { createInputQueue } from "@/lib/terminal/input-queue"
import { shouldFit } from "@/lib/terminal/fit"
import { gridFor, tracksFor } from "@/lib/terminal/grid-layout"
import { TerminalGutters, type TrackAxis } from "@/components/terminal-gutters"
import { elapsed, plainSummary, shouldNotify, shouldPollRuns, statusView, TAKEOVER_PREFIX } from "@/lib/agent-runs/run-view"
import type { RunStatus } from "@/lib/agent-runs/records"
import { slotKeyAction } from "@/lib/terminal/slot-keys"
import { runsApi, type RunSummary } from "@/lib/agent-runs/client"
import { AgentRunReview } from "@/components/agent-run-review"
import { TerminalWorkspaceDialog } from "@/components/terminal-workspace-dialog"
import { getAiExecutor } from "@/lib/ai-executors"
import { DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME, type Workspace } from "@/lib/terminal/workspace-model"

type TerminalKind = "ai" | "shell" | "run"
type Tab = { id: string; kind: TerminalKind; label: string; workspaceId?: string }

/** A tab with no workspace — a run, a take-over, a session from before workspaces — sits in Main. */
const workspaceOf = (tab: Tab) => tab.workspaceId ?? DEFAULT_WORKSPACE_ID

const MAIN_ONLY: Workspace[] = [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME }]

/** Ids name a real process on the server, which validates the shape before it
 *  becomes one. `randomUUID` needs a secure context — localhost is one, but a
 *  fallback costs a line and removes the question. */
function newSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.replace(/-/g, "")
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** "Assistant", "Assistant 2", "Command line" — the tab's own name for itself.
 *  Numbered per kind rather than globally, so opening a shell doesn't rename
 *  the assistant sitting next to it. */
function tabName(tabs: Tab[], tab: Tab): string {
  // A taken-over run is the person's own session in the agent's copy, not "Assistant 2".
  if (tab.label.startsWith(TAKEOVER_PREFIX)) return tab.label
  // A run is named by its task, not numbered: eight "Agent 3"s would say nothing.
  if (tab.kind === "run") return tab.label
  const base = tab.kind === "ai" ? "Assistant" : "Command line"
  const sameKind = tabs.filter((t) => t.kind === tab.kind)
  const position = sameKind.indexOf(tab) + 1
  return sameKind.length > 1 ? `${base} ${position}` : base
}

/**
 * One session's screen. Output arrives through the page's single stream hub,
 * keystrokes leave through its single input queue — see stream-hub.ts and
 * input-queue.ts for why neither is per tab any more.
 *
 * Every open tab stays MOUNTED; the inactive ones are hidden. It used to be the
 * active tab only, which meant every switch disposed the xterm and replayed up
 * to 200KB of backlog into a new one — a visible stall on each click.
 */
const TRACKS_KEY = "alacran-terminal-tracks"
const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

function TerminalView({
  agentId,
  sessionId,
  active,
  focused,
  readOnly,
  hub,
  input,
}: {
  agentId: string
  sessionId: string
  /** The one pane that takes the keyboard. Not the same as visible: in the
   *  grid every pane is visible, and focusing all of them hands the keyboard
   *  to whichever mounted last. */
  focused: boolean
  active: boolean
  /** An unattended agent's pane: it has no stdin, so typing into it would go nowhere. */
  readOnly: boolean
  hub: ReturnType<typeof createStreamHub>
  input: ReturnType<typeof createInputQueue>
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)

  useEffect(() => {
    let disposed = false
    let detach: (() => void) | null = null
    let observer: ResizeObserver | null = null
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    async function start() {
      const [{ Terminal }, { FitAddon }, { WebglAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/addon-webgl"),
      ])
      // Measure glyphs with the real font, or the renderer builds its atlas
      // from the fallback and rebuilds it mid-stream when the font lands.
      await document.fonts.ready
      if (disposed || !hostRef.current) return

      // Read the real tokens rather than hardcoding hexes: the terminal has to
      // follow the theme like everything else.
      const css = getComputedStyle(document.documentElement)
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
      const term = new Terminal({
        fontFamily: token("--typeface-mono", "ui-monospace, Menlo, monospace"),
        fontSize: 12.5,
        lineHeight: 1.35,
        cursorBlink: !readOnly,
        disableStdin: readOnly,
        // 5,000 lines filled in a long session, and from then on every new line aged off the top the
        // history you had scrolled to, dragging the view to the oldest line until scrolling looked
        // dead. 20,000 is ~35MB at 145 columns per terminal, allocated only as lines arrive.
        scrollback: 20_000,
        // 0, the default, moves a wheel notch's ~6 lines in a single frame.
        smoothScrollDuration: 125,
        // The terminal sits BELOW the page ground on purpose — it should read
        // as a hole cut in the app, not a panel resting on it.
        theme: {
          background: token("--terminal-bg", "#0a0605"),
          foreground: token("--terminal-fg", "#d6c8c2"),
          // A read-only pane takes no typing, so it draws no cursor to suggest it does.
          cursor: readOnly ? "transparent" : token("--primary", "#ff2e43"),
          cursorAccent: readOnly ? "transparent" : undefined,
          selectionBackground: "rgba(255,46,67,0.28)",
        },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(hostRef.current)
      // GPU rendering is what keeps eight streaming panes scrollable. It must
      // load after open(); if the GPU context is refused or later lost, xterm
      // falls back to its DOM renderer, which is slower but correct.
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        term.loadAddon(webgl)
      } catch {
        /* no WebGL here: DOM renderer */
      }
      // xterm takes ⌘↵ as Enter (and Ctrl+3–8 as control codes) and stops the
      // event, so the grid's own shortcuts are handed back to the page. Esc is
      // not a slot key inside a terminal and stays the program's.
      const slotKeyContext = { isMac: IS_MAC, inTerminal: true, hidden: false, inWorkspace: true, inField: false }
      term.attachCustomKeyEventHandler((e) => e.type !== "keydown" || !slotKeyAction(e, slotKeyContext))
      termRef.current = term
      if (focused) term.focus()

      let sent = { cols: 0, rows: 0 }
      const refit = () => {
        const host = hostRef.current
        // `disposed`: a frame queued by the observer can land after the pane closed.
        if (disposed || !host || !shouldFit(host.clientWidth, host.clientHeight)) return
        fit.fit()
        if (term.cols === sent.cols && term.rows === sent.rows) return
        if (resizeTimer) clearTimeout(resizeTimer)
        // Debounced: a window drag fires dozens of these, and a TUI redraws on each.
        resizeTimer = setTimeout(() => {
          sent = { cols: term.cols, rows: term.rows }
          void fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
            method: "POST",
            // Not a "simple" content type, so a cross-origin caller has to pass a
            // preflight it cannot pass. The server checks Origin as well.
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "resize", session: sessionId, cols: term.cols, rows: term.rows }),
          }).catch(() => {})
        }, 50)
      }
      refit()

      if (!readOnly) term.onData((data) => input.enqueue(sessionId, data))
      detach = hub.attach(sessionId, { write: (d, done) => term.write(d, done) })
      // Reflow on any size change — including a hidden tab becoming visible.
      // A TUI that doesn't reflow is the whole reason this needs a real pty.
      observer = new ResizeObserver(() => requestAnimationFrame(refit))
      observer.observe(hostRef.current)
    }

    void start()
    return () => {
      disposed = true
      if (resizeTimer) clearTimeout(resizeTimer)
      observer?.disconnect()
      detach?.()
      termRef.current?.dispose()
      termRef.current = null
      // The pty deliberately keeps running: closing the view should not kill a
      // build half way through. It ends with the app, or with the tab's ×.
    }
    // `active` is read once at mount for the initial focus; the effect below
    // handles every change after that without rebuilding the terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, sessionId, readOnly, hub, input])

  useEffect(() => {
    if (focused) termRef.current?.focus()
  }, [focused])

  return <div ref={hostRef} className="terminal-host" hidden={!active} />
}

/**
 * This company's agent runs, every 3s while the page is visible (or while a
 * run is working, so its finishing is seen in time to notify). Polling, not
 * a stream: run state changes a few times a minute at most, and the stream
 * already carries every pane's output.
 */
function useRuns(agentId: string): [RunSummary[], () => void, (id: string) => void] {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const latest = useRef<RunSummary[]>([])
  latest.current = runs
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!shouldPollRuns(document.hidden, latest.current)) return
      const listed = await runsApi.list(agentId)
      if (!cancelled && listed) setRuns(listed)
    }
    void load()
    const timer = setInterval(() => void load(), 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [agentId, tick])
  // `drop` takes a kept or discarded run off screen at once, rather than
  // leaving it as a live-looking card until the next poll.
  const drop = (id: string) => setRuns((current) => current.filter((r) => r.id !== id))
  return [runs, () => setTick((t) => t + 1), drop]
}

/**
 * The terminal as its own view of a company, not a panel wedged beside the
 * file tree.
 *
 * It is reached the same way a file is — from the explorer on the left — and it
 * takes the whole workbench when it is what you are looking at. The dock this
 * replaces was a fourth column that squeezed the explorer and the file pane
 * onto their minimums at any normal window width, which is the shape the
 * "don't scatter it" instruction was about.
 *
 * **A new tab is an assistant, not a `$` prompt.** The company's own AI
 * executor starts already told what this company is — the same briefing the Get
 * Started button gives, from the same `buildGetStartedIntroPrompt`, so it costs
 * read-everything tokens only when something actually changed (v47). For the
 * audience this app is for, a blank shell is not a starting point; a colleague
 * who already read the file is. The plain command line is still one click away
 * and is shown to everyone, because it already was (v106's own exception to the
 * hide-it-in-simple-mode rule).
 */
export function TerminalWorkspace({
  agentId,
  companyName,
  onEmpty,
}: {
  agentId: string
  companyName: string
  /** Closing the last tab leaves nothing to look at, so the terminal hands the
   *  workbench back rather than sitting there empty. */
  onEmpty?: () => void
}) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const [canUseAssistant, setCanUseAssistant] = useState(false)
  /** A refusal in the user's own words — an executor that isn't installed, the
   *  session cap, a folder with nothing to read. Never a status code. */
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [runs, refreshRuns, dropRun] = useRuns(agentId)
  const [layout, setLayout] = useState<"grid" | "focus">("focus")
  // Column and row sizes the user dragged, saved per grid shape ("2x2": a 2-by-2 grid), so
  // opening a third terminal does not throw away what they set for two.
  const [sizes, setSizes] = useState<Record<string, { cols: number[]; rows: number[] }>>({})
  const sizesRef = useRef(sizes)
  const [announcement, setAnnouncement] = useState("")
  const previousStatus = useRef(new Map<string, { status: RunStatus; word: string }>())
  const sectionRef = useRef<HTMLElement | null>(null)
  // What the keyboard handler needs, current as of the last render.
  const slotIdsRef = useRef<string[]>([])
  const cardRunsRef = useRef<RunSummary[]>([])
  const tabsRef = useRef<Tab[]>([])
  const layoutRef = useRef<"grid" | "focus">("focus")
  const [workspaces, setWorkspaces] = useState<Workspace[]>(MAIN_ONLY)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(DEFAULT_WORKSPACE_ID)
  const [companyExecutorId, setCompanyExecutorId] = useState("")
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null)
  const activeWorkspaceRef = useRef(DEFAULT_WORKSPACE_ID)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  // A per-viewer convenience, so browser storage (and a guarded read) is right.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("alacran-terminal-layout")
      if (saved === "grid" || saved === "focus") setLayout(saved)
    } catch {
      /* private window: the default stands */
    }
  }, [])
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem(TRACKS_KEY) ?? "null")
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        sizesRef.current = saved as typeof sizes
        setSizes(sizesRef.current)
      }
    } catch {
      /* private window or damaged value: the grid stays even */
    }
  }, [])
  // Status changes, said to a screen reader all together (spec §5) — output
  // never is — and, for a run that stops while the window is hidden, a
  // notification.
  useEffect(() => {
    const said: string[] = []
    // Away: another tab, or another app in front of this window.
    const away = document.hidden || !document.hasFocus()
    for (const r of runs) {
      const before = previousStatus.current.get(r.id)
      const view = statusView(r.status, r.driving)
      // The word, not the status: "You're driving" is a change worth saying too.
      if (before && before.word !== view.word) said.push(`${r.title}: ${view.word}`)
      if (shouldNotify(before?.status, r.status, away) && typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(`${r.title}: ${view.word}`, { body: plainSummary(r.summary ?? r.reason ?? "") })
      }
      previousStatus.current.set(r.id, { status: r.status, word: view.word })
    }
    if (said.length) setAnnouncement(said.join(". "))
  }, [runs])
  useEffect(() => {
    const cards = runs.filter((r) => !tabs.some((t) => t.id === r.id))
    cardRunsRef.current = cards
    tabsRef.current = tabs
    // ⌘1–⌘8 reach what is on screen: this workspace's tabs, and the run cards only in Main.
    const here = activeWorkspaceId === DEFAULT_WORKSPACE_ID
    slotIdsRef.current = [...tabs.filter((t) => workspaceOf(t) === activeWorkspaceId).map((t) => t.id), ...(here ? cards.map((r) => r.id) : [])]
    layoutRef.current = layout
    activeWorkspaceRef.current = activeWorkspaceId
  })
  // ⌘1–⌘8, ⌘↵, Esc (lib/terminal/slot-keys.ts). The terminal stays mounted on
  // every company page (TerminalPersist), so this only acts while it can be
  // seen, and never on a key a dialog over it has already taken.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const section = sectionRef.current
      if (!section) return
      const target = event.target instanceof Element ? event.target : null
      const inTerminal = !!target?.closest(".xterm")
      const action = slotKeyAction(event, {
        isMac: IS_MAC,
        inTerminal,
        // TerminalPersist hides the page with `inert`, not display:none.
        hidden: !!section.closest("[inert]"),
        inWorkspace: target === document.body || (!!target && section.contains(target)),
        inField: !inTerminal && !!target?.closest("input, textarea, select, [contenteditable]"),
      })
      if (!action) return
      if (action.type === "focus") {
        const id = slotIdsRef.current[action.index]
        if (!id) return
        setActiveId(id)
      } else {
        const next = action.type === "grid" || layoutRef.current === "focus" ? "grid" : "focus"
        setLayout(next)
        try {
          window.localStorage.setItem("alacran-terminal-layout", next)
        } catch {
          /* not remembered, still applied */
        }
      }
      event.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const chooseLayout = (next: "grid" | "focus") => {
    setLayout(next)
    try {
      window.localStorage.setItem("alacran-terminal-layout", next)
    } catch {
      /* not remembered, still applied */
    }
  }

  // One connection per company page, whatever the tab count (stream-hub.ts).
  const [hub, setHub] = useState<ReturnType<typeof createStreamHub> | null>(null)
  useEffect(() => {
    const url = `/api/terminal/${encodeURIComponent(agentId)}`
    const created = createStreamHub(
      () => openEventSource(`${url}?stream=all`),
      // What xterm has drawn, so the server can pause a pane this page has
      // fallen behind on (company-stream.ts, flow control).
      (stream, items) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ack", stream, items }),
        }).then((response) => response.ok),
      undefined,
      () => document.hidden
    )
    setHub(created)
    return () => created.close()
  }, [agentId])
  const input = useMemo(
    () =>
      createInputQueue((items) =>
        fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "input-batch", items }),
        })
      ),
    [agentId]
  )

  const openTab = useCallback(
    async (kind: TerminalKind, workspaceId: string = activeWorkspaceRef.current) => {
      setNotice(null)
      setOpening(true)
      const id = newSessionId()
      try {
        const response = await fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "open", session: id, kind, workspace: workspaceId }),
        })
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { message?: string }
          setNotice(body.message ?? "That terminal couldn't be started.")
          return
        }
        const session = (await response.json()) as Tab
        setTabs((current) => [...current, { id, kind, label: session.label, workspaceId }])
        setActiveId(id)
        setActiveWorkspaceId(workspaceId)
        window.dispatchEvent(
          new CustomEvent<TerminalStatusChangedDetail>(TERMINAL_STATUS_CHANGED_EVENT, { detail: { agentId } })
        )
      } catch {
        setNotice("That terminal couldn't be started.")
      } finally {
        setOpening(false)
      }
    },
    [agentId]
  )

  // Mount: ask what this machine can do, then what is already running. A pty
  // outlives the page, so the tab strip is restored from the server rather than
  // remembered here — a reload lands back in the same sessions.
  useEffect(() => {
    let cancelled = false
    // Switching companies is a different set of terminals, so the previous
    // one's tabs are cleared here rather than in a second effect — two effects
    // on the same dependency run in declaration order, and the one that clears
    // must not be the one that lands last.
    setTabs([])
    setActiveId(null)
    setWorkspaces(MAIN_ONLY)
    setActiveWorkspaceId(DEFAULT_WORKSPACE_ID)
    setNotice(null)
    setStatus("loading")
    async function restore() {
      try {
        const probe = await fetch(`/api/terminal/${encodeURIComponent(agentId)}?probe=1`)
        const { available, canUseAssistant: assistantOk, executorId } = (await probe.json()) as {
          available: boolean
          canUseAssistant: boolean
          executorId?: string
        }
        if (cancelled) return
        if (!available) {
          setStatus("unavailable")
          return
        }
        setCanUseAssistant(assistantOk)
        setCompanyExecutorId(executorId ?? "")

        const listed = await fetch(`/api/terminal/${encodeURIComponent(agentId)}?list=1`)
        const { sessions, workspaces: saved } = (await listed.json()) as { sessions: Tab[]; workspaces?: Workspace[] }
        if (cancelled) return
        setStatus("ready")
        if (saved?.length) setWorkspaces(saved)
        if (sessions.length > 0) {
          const last = sessions[sessions.length - 1]
          setTabs(sessions)
          setActiveId(last.id)
          setActiveWorkspaceId(workspaceOf(last))
          return
        }
        // Nothing running: open the one that needs no explanation.
        void openTab(assistantOk ? "ai" : "shell")
      } catch {
        if (!cancelled) setStatus("unavailable")
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per company, not per openTab identity
  }, [agentId])

  /**
   * Hand this session's work to the company's memory.
   *
   * Deliberately not "and commit it": the server asks the assistant to write a
   * note and records what the folder looked like first, so the result arrives
   * in the same review queue a scheduled digest lands in — a diff with the
   * sidebar dot, approved by a person. The whole value of this app's memory is
   * that a human agreed to every line of it.
   */
  async function saveNote(id: string) {
    setSaving(true)
    setNotice(null)
    try {
      const response = await fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "save-note", session: id }),
      })
      const body = await response.json().catch(() => ({}))
      setNotice(body.message ?? "Couldn't save a note for this session.")
    } catch {
      setNotice("Couldn't save a note for this session.")
    } finally {
      setSaving(false)
    }
  }

  async function closeTab(id: string) {
    await fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "kill", session: id }),
    }).catch(() => {})
    // Stopping a WORKING run leaves its slot where it is: the run settles, and
    // its review strip appears in its place. Any other tab — including a run
    // whose record is gone — is removed.
    if (runs.find((r) => r.id === id)?.status === "running") {
      refreshRuns()
      return
    }
    // Read the tabs as of now, not as of the click: one may have been added
    // while the kill was in flight, and it must survive.
    const closed = tabsRef.current.find((t) => t.id === id)
    const next = tabsRef.current.filter((t) => t.id !== id)
    // Focus moves to a neighbour in the SAME workspace; another workspace's tab
    // would make the screen show nothing while it holds the keyboard.
    const home = closed ? workspaceOf(closed) : activeWorkspaceRef.current
    const neighbours = next.filter((t) => workspaceOf(t) === home)
    const fallback = home === DEFAULT_WORKSPACE_ID ? cardRunsRef.current[0]?.id : undefined
    setTabs((current) => current.filter((t) => t.id !== id))
    setActiveId((active) => (active === id ? (neighbours[neighbours.length - 1]?.id ?? fallback ?? null) : active))
    // The workbench goes back only when nothing — not even a run waiting for review — is left.
    if (next.length === 0 && cardRunsRef.current.length === 0) onEmpty?.()
    window.dispatchEvent(
      new CustomEvent<TerminalStatusChangedDetail>(TERMINAL_STATUS_CHANGED_EVENT, { detail: { agentId } })
    )
  }

  if (status === "unavailable") {
    return (
      <section className="terminal-pane" aria-label={`Terminal for ${companyName}`}>
        <div className="terminal-unavailable">
          <p className="font-medium text-foreground">The in-app terminal needs Node 20 or newer.</p>
          <p className="mt-1.5">
            This machine is running an older one — everything else in Alacrán works normally. Use{" "}
            <b className="text-foreground">Open in Terminal</b> on the company for now.
          </p>
        </div>
      </section>
    )
  }

  const active = tabs.find((t) => t.id === activeId) ?? null
  const runById = new Map(runs.map((r) => [r.id, r]))
  // A finished run whose live session is gone (a reload, a restart) is still a
  // slot: its review strip is the only way to keep or discard it.
  const cardRuns = runs.filter((r) => !tabs.some((t) => t.id === r.id))
  // Every tab stays mounted (see TerminalView); only this workspace's are shown.
  const inMain = activeWorkspaceId === DEFAULT_WORKSPACE_ID
  const workspaceTabs = tabs.filter((t) => workspaceOf(t) === activeWorkspaceId)
  const slotCount = workspaceTabs.length + (inMain ? cardRuns.length : 0)
  const currentWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? MAIN_ONLY[0]
  const { cols, rows } = gridFor(slotCount)
  const shape = `${cols}x${rows}`
  const colTracks = tracksFor(cols, sizes[shape]?.cols)
  const rowTracks = tracksFor(rows, sizes[shape]?.rows)
  // Reads the ref, not state, so a drag's many updates in one frame compose instead of overwriting each other.
  const resizeTracks = (axis: TrackAxis, tracks: number[], commit: boolean) => {
    const current = sizesRef.current[shape]
    const next = { ...sizesRef.current, [shape]: { cols: current?.cols ?? colTracks, rows: current?.rows ?? rowTracks, [axis]: tracks } }
    sizesRef.current = next
    setSizes(next)
    if (!commit) return
    try {
      window.localStorage.setItem(TRACKS_KEY, JSON.stringify(next))
    } catch {
      /* not remembered, still applied */
    }
  }
  const working = runs.filter((r) => r.status === "running").length
  const waiting = runs.filter((r) => r.status !== "running" && !r.driving).length
  /** A run was kept or discarded: it is over, so its tab and card go now, and
   *  focus moves to something that still exists instead of a blank pane. */
  const landed = (runId: string, message: string) => {
    dropRun(runId)
    const remaining = tabs.filter((t) => t.id !== runId)
    setTabs(remaining)
    if (activeId === runId) setActiveId(remaining[remaining.length - 1]?.id ?? null)
    setNotice(message)
    refreshRuns()
  }
  const tookOver = (taken: Tab) => {
    setTabs((current) => [...current, taken])
    setActiveId(taken.id)
    setActiveWorkspaceId(DEFAULT_WORKSPACE_ID)
    refreshRuns()
  }

  const selectWorkspace = (id: string) => {
    const mine = tabsRef.current.filter((t) => workspaceOf(t) === id)
    setActiveWorkspaceId(id)
    setActiveId(mine[mine.length - 1]?.id ?? (id === DEFAULT_WORKSPACE_ID ? cardRunsRef.current[0]?.id : undefined) ?? null)
  }

  /** One POST for the three workspace actions. A refusal comes back as its own
   *  sentence, which the form shows without closing. */
  async function workspaceCall(body: Record<string, unknown>): Promise<{ workspace?: Workspace; refusal: string | null }> {
    const response = await fetch(`/api/terminal/${encodeURIComponent(agentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const refusal = ((await response.json().catch(() => ({}))) as { message?: string }).message
      return { refusal: refusal ?? "That didn't work. Try again." }
    }
    const parsed = response.status === 204 ? {} : ((await response.json().catch(() => ({}))) as { workspace?: Workspace })
    return { workspace: parsed.workspace, refusal: null }
  }

  const createWorkspace = async (name: string, executorId: string) => {
    const { workspace, refusal } = await workspaceCall({ type: "workspace-create", name, executor: executorId })
    if (refusal || !workspace) return refusal ?? "That didn't work. Try again."
    setWorkspaces((current) => [...current, workspace])
    setActiveWorkspaceId(workspace.id)
    setActiveId(null)
    // A workspace you can't see anything in looks broken: start what Main starts.
    void openTab(canUseAssistant ? "ai" : "shell", workspace.id)
    return null
  }
  const editWorkspace = async (name: string, executorId: string) => {
    // Main sends no AI: it follows the company's, and the form does not offer one.
    const ai = activeWorkspaceId === DEFAULT_WORKSPACE_ID ? {} : { executor: executorId }
    const { workspace, refusal } = await workspaceCall({ type: "workspace-update", workspace: activeWorkspaceId, name, ...ai })
    if (refusal || !workspace) return refusal ?? "That didn't work. Try again."
    setWorkspaces((current) => current.map((w) => (w.id === workspace.id ? workspace : w)))
    return null
  }
  const deleteWorkspace = async () => {
    const { refusal } = await workspaceCall({ type: "workspace-delete", workspace: activeWorkspaceId })
    if (refusal) return refusal
    setWorkspaces((current) => current.filter((w) => w.id !== activeWorkspaceId))
    selectWorkspace(DEFAULT_WORKSPACE_ID)
    return null
  }

  return (
    <section ref={sectionRef} className={`terminal-pane terminal-pane--${layout}`} aria-label={`Terminal for ${companyName}`}>
      <div className="terminal-pane-head">
        {layout === "focus" ? (
          <div className="terminal-tabs" role="tablist" aria-label="Open terminals">
            {workspaceTabs.map((tab) => {
              const name = tabName(workspaceTabs, tab)
              const stop = tab.kind === "run" && runById.get(tab.id)?.status === "running"
              return (
                <span key={tab.id} className={`terminal-tab${tab.id === activeId ? " terminal-tab--active" : ""}`}>
                  <button type="button" role="tab" aria-selected={tab.id === activeId} onClick={() => setActiveId(tab.id)}>
                    <TabIcon kind={tab.kind} />
                    <span className="truncate">{name}</span>
                    {runById.get(tab.id) && <ChipStatus run={runById.get(tab.id)!} />}
                  </button>
                  {(tab.kind !== "run" || stop) && (
                    <button
                      type="button"
                      className="terminal-tab-close"
                      onClick={() => void closeTab(tab.id)}
                      title={stop ? `Stop ${name}` : `Close ${name}`}
                      aria-label={stop ? `Stop ${name}` : `Close ${name}`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              )
            })}
            {(inMain ? cardRuns : []).map((run) => (
              <span key={run.id} className={`terminal-tab${run.id === activeId ? " terminal-tab--active" : ""}`}>
                <button type="button" role="tab" aria-selected={run.id === activeId} onClick={() => setActiveId(run.id)}>
                  <Bot className="size-3.5 shrink-0" />
                  <span className="truncate">{run.title}</span>
                  <ChipStatus run={run} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="terminal-summary">
            {runs.length === 0
              ? `${slotCount} open`
              : [working && `${working} working`, waiting && `${waiting} waiting for you`].filter(Boolean).join(", ") ||
                "All agents finished"}
          </p>
        )}

        <span className="flex-1" />

        <select
          className="terminal-workspace-select"
          aria-label="Workspace"
          title="Switch workspace"
          value={activeWorkspaceId}
          onChange={(event) => selectWorkspace(event.target.value)}
        >
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name}
            </option>
          ))}
        </select>
        <button type="button" className="terminal-add" onClick={() => setDialog("edit")} title="Rename this workspace or change its AI">
          <Pencil className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Edit workspace</span>
        </button>
        <button type="button" className="terminal-add" onClick={() => setDialog("create")} title="Add a workspace: its own set of terminals">
          <Plus className="size-3.5" aria-hidden />
          <Layers className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">New workspace</span>
        </button>
        <div className="terminal-layout" role="group" aria-label="Layout">
          <button type="button" aria-pressed={layout === "grid"} onClick={() => chooseLayout("grid")}>
            <LayoutGrid className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Grid</span>
          </button>
          <button type="button" aria-pressed={layout === "focus"} onClick={() => chooseLayout("focus")}>
            <Square className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">Focus</span>
          </button>
        </div>
        {canUseAssistant && (
          <button type="button" className="terminal-add" onClick={() => void openTab("ai")} disabled={opening}>
            <Plus className="size-3.5" />
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline">New assistant</span>
          </button>
        )}
        <button type="button" className="terminal-add" onClick={() => void openTab("shell")} disabled={opening}>
          <Plus className="size-3.5" />
          <TerminalIcon className="size-3.5" />
          <span className="hidden sm:inline">Command line</span>
        </button>
        {layout === "focus" && active?.kind === "ai" && (
          <button
            type="button"
            className="terminal-add ml-auto"
            onClick={() => void saveNote(active.id)}
            disabled={saving}
            title="The assistant writes a short note of what this session did. You approve it before it's kept."
          >
            <BookmarkPlus className="size-3.5" aria-hidden />
            <span>{saving ? "Saving…" : "Save what we learned"}</span>
          </button>
        )}
      </div>

      {notice && (
        <p className="terminal-notice" role="status">
          {notice}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {layout === "focus" && active?.kind === "ai" && active.label.startsWith(TAKEOVER_PREFIX) && (
        <p className="terminal-caption">
          You&apos;re working in the agent&apos;s own copy of {companyName}, and it can run commands if you allow them. Close
          this tab when you&apos;re done: what you changed goes back for review, and nothing reaches the company until you keep it.
        </p>
      )}
      {layout === "focus" && active?.kind === "ai" && !active.label.startsWith(TAKEOVER_PREFIX) && (
        <p className="terminal-caption">
          Ask in plain English — {active.label} has already read what {companyName} is set up to do.
        </p>
      )}
      {layout === "focus" && active?.kind === "ai" && <ExecutorGapNote agentId={agentId} need="opening-message" />}
      {layout === "focus" && active?.kind === "run" && runById.get(active.id)?.status === "running" && (
        <p className="terminal-caption">
          This agent is working on its own copy of {companyName}. Nothing it changes touches the company&apos;s files.
        </p>
      )}

      {/* ONE container for every slot, in a stable order, whatever the layout:
          moving a terminal to another parent remounts it, and a remounted xterm
          is blank — the stream only carries what comes next. */}
      <div
        className="terminal-slots"
        style={
          layout === "grid"
            ? {
                gridTemplateColumns: colTracks.map((f) => `minmax(0, ${f}fr)`).join(" "),
                gridTemplateRows: rowTracks.map((f) => `minmax(0, ${f}fr)`).join(" "),
              }
            : undefined
        }
      >
        {hub &&
          tabs.map((tab) => {
            const run = runById.get(tab.id)
            const visible = workspaceOf(tab) === activeWorkspaceId && (layout === "grid" || tab.id === activeId)
            return (
              <div
                key={tab.id}
                className={`terminal-slot${tab.id === activeId ? " terminal-slot--focused" : ""}`}
                data-tone={run ? statusView(run.status, run.driving).tone : undefined}
                hidden={!visible}
                onMouseDown={() => setActiveId(tab.id)}
              >
                <SlotHeader
                  name={tabName(workspaceTabs, tab)}
                  kind={tab.kind}
                  run={run}
                  now={now}
                  onClose={() => void closeTab(tab.id)}
                  onFocus={() => {
                    setActiveId(tab.id)
                    chooseLayout("focus")
                  }}
                  onSave={tab.kind === "ai" ? () => void saveNote(tab.id) : undefined}
                  saving={saving}
                />
                <TerminalView
                  agentId={agentId}
                  sessionId={tab.id}
                  active={visible}
                  focused={tab.id === activeId}
                  readOnly={tab.kind === "run"}
                  hub={hub}
                  input={input}
                />
                {run && run.status !== "running" && !run.driving && (
                  <AgentRunReview
                    agentId={agentId}
                    run={run}
                    companyName={companyName}
                    onLanded={(message) => landed(run.id, message)}
                    onTakenOver={tookOver}
                    onAsked={() => refreshRuns()}
                  />
                )}
              </div>
            )
          })}
        {cardRuns.map((run) => (
          <div
            key={run.id}
            className={`terminal-slot terminal-slot--card${run.id === activeId ? " terminal-slot--focused" : ""}`}
            data-tone={statusView(run.status, run.driving).tone}
            hidden={!inMain || (layout === "focus" && activeId !== run.id)}
            onMouseDown={() => setActiveId(run.id)}
          >
            <SlotHeader
              name={run.title}
              kind="run"
              run={run}
              now={now}
              onFocus={() => {
                setActiveId(run.id)
                chooseLayout("focus")
              }}
            />
            <p className="terminal-slot-gone">This agent&apos;s live output isn&apos;t available any more. Its changes are saved.</p>
            {run.status !== "running" && !run.driving && (
              <AgentRunReview
                agentId={agentId}
                run={run}
                companyName={companyName}
                onLanded={(message) => landed(run.id, message)}
                onTakenOver={tookOver}
                onAsked={(label) => {
                  // Sent back from a card: its new pass streams into a tab, so it needs one.
                  setTabs((current) => (current.some((t) => t.id === run.id) ? current : [...current, { id: run.id, kind: "run", label }]))
                  setActiveId(run.id)
                  refreshRuns()
                }}
              />
            )}
          </div>
        ))}
        {layout === "grid" && slotCount > 1 && <TerminalGutters cols={colTracks} rows={rowTracks} onChange={resizeTracks} />}
      </div>

      {slotCount === 0 && status === "loading" && (
        <div className="terminal-unavailable">
          <p>Starting…</p>
        </div>
      )}
      {slotCount === 0 && status !== "loading" && (
        <div className="terminal-empty">
          <p className="terminal-empty-lead">Nothing is open.</p>
          <p>
            Start an assistant to ask about {companyName}.
          </p>
          <div className="terminal-empty-actions">
            {canUseAssistant && (
              <button type="button" className="run-btn run-btn--primary" onClick={() => void openTab("ai")}>
                New assistant
              </button>
            )}
            <button type="button" className="run-btn" onClick={() => void openTab("shell")}>
              Command line
            </button>
          </div>
        </div>
      )}

      {dialog && (
        <TerminalWorkspaceDialog
          mode={dialog}
          workspace={dialog === "edit" ? currentWorkspace : undefined}
          companyAiLabel={getAiExecutor(companyExecutorId).label}
          canDelete={dialog === "edit" && !inMain && workspaceTabs.length === 0}
          onSubmit={(name, executorId) => (dialog === "create" ? createWorkspace(name, executorId) : editWorkspace(name, executorId))}
          onDelete={dialog === "edit" ? deleteWorkspace : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  )
}

/** A run's status on its focus-mode tab: a dot AND a word, never colour alone. */
function ChipStatus({ run }: { run: RunSummary }) {
  const status = statusView(run.status, run.driving)
  return (
    <span className="terminal-tab-status" data-tone={status.tone}>
      {status.word}
    </span>
  )
}

function TabIcon({ kind }: { kind: TerminalKind }) {
  if (kind === "ai") return <Sparkles className="size-3.5 shrink-0" />
  if (kind === "run") return <Bot className="size-3.5 shrink-0" />
  return <TerminalIcon className="size-3.5 shrink-0" />
}

/** A slot's own header — shown in the grid; in focus mode the tab strip does its job. */
function SlotHeader({
  name,
  kind,
  run,
  now,
  onClose,
  onFocus,
  onSave,
  saving,
}: {
  name: string
  kind: TerminalKind
  run?: RunSummary
  now: number
  onClose?: () => void
  onFocus?: () => void
  /** An assistant's pane: ask it to write down what the session was. */
  onSave?: () => void
  saving?: boolean
}) {
  const status = run ? statusView(run.status, run.driving) : null
  return (
    <div className="terminal-slot-head" onDoubleClick={onFocus}>
      <TabIcon kind={kind} />
      {status && <span className="terminal-slot-status">{status.word}</span>}
      <span className="terminal-slot-name" title={name}>
        {name}
      </span>
      {run && <span className="terminal-slot-meta">{elapsed(run.startedAt, run.endedAt, now)}</span>}
      {run && run.changedFiles > 0 && (
        <span className="terminal-slot-meta">
          {run.changedFiles} file{run.changedFiles === 1 ? "" : "s"}
        </span>
      )}
      {onSave && (
        <button
          type="button"
          className="terminal-add"
          onClick={onSave}
          disabled={saving}
          title="The assistant writes a short note of what this session did. You approve it before it's kept."
          aria-label={`Save what we learned in ${name}`}
        >
          <BookmarkPlus className="size-3" aria-hidden />
          {saving ? "Saving…" : "Save what we learned"}
        </button>
      )}
      {onFocus && (
        <button
          type="button"
          className="terminal-add"
          onClick={onFocus}
          title="Show only this terminal, full size. Switch back with Grid."
          aria-label={`Focus ${name}`}
        >
          <Maximize2 className="size-3" aria-hidden />
          Focus
        </button>
      )}
      {onClose && (!run || run.status === "running") && (
        <button
          type="button"
          className="terminal-tab-close"
          onClick={onClose}
          title={kind === "run" ? "Stop" : "Close"}
          aria-label={kind === "run" ? `Stop ${name}` : `Close ${name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}
