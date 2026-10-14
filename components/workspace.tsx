"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  LayoutGrid,
  Search,
  Terminal as TerminalIcon,
} from "lucide-react"
import { FileActions } from "@/components/file-actions"
import { TerminalWorkspace } from "@/components/terminal-workspace"
import {
  OPEN_TERMINAL_EVENT,
  TERMINAL_STATUS_CHANGED_EVENT,
  type OpenTerminalDetail,
} from "@/lib/terminal-panel-event"
import { listFolder } from "@/lib/file-ops"
import type { FolderEntry } from "@/lib/file-ops-impl"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { SkillEntry } from "@/lib/skills/types"
import type { SkillAgentResult } from "@/lib/get-all-skills"
import type { RunSignals } from "@/lib/company-commands/run-signals"
import { getActivityDetail } from "@/lib/get-activity-detail"
import { SkillEditor } from "@/components/skill-editor"
import { SkillHistory } from "@/components/skill-history"
import { ReorderableGrid } from "@/components/reorderable-grid"
import { COMPANY_COMMANDS } from "@/lib/company-commands/registry"
import { commandFileNameOf } from "@/lib/company-commands/command-file-name"
import { DEPARTMENT_ORDER, GENERAL_DEPARTMENT } from "@/lib/company-starter-packs"
import { DEPARTMENTS_KEY, nextOverrides, type DepartmentOverrides } from "@/lib/skills/department-overrides"
import { CompanyCommandRunner } from "@/components/company-command-runner"
import { CompanyStrings, ShareHandle } from "@/components/os/company-strings"
import type { ShareLink } from "@/lib/sharing/model"

/**
 * Filing is per browser and touches no file — the same shape
 * components/reorderable-grid.tsx uses for card order. Inline here because
 * this is the only component that reads or writes it; the rule that decides
 * WHAT to store lives in department-overrides.ts, where its test can reach it.
 */
function loadOverrides(): DepartmentOverrides {
  try {
    // A hand-edited or half-written value must not take the page down with it.
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DEPARTMENTS_KEY) ?? "{}")
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as DepartmentOverrides) : {}
  } catch {
    return {}
  }
}

function saveOverrides(overrides: DepartmentOverrides): void {
  try {
    window.localStorage.setItem(DEPARTMENTS_KEY, JSON.stringify(overrides))
  } catch {
    // Private mode, or a full quota. The move still applies for this session.
  }
}

/**
 * One folder's children, recursively for whatever is open.
 *
 * Recursive because the shape is, and it is bounded by what the user has
 * actually expanded — nothing is walked ahead of a click.
 */
function FolderTree({
  dirPath,
  agentId,
  listings,
  expanded,
  selectedPath,
  onToggle,
  onOpenFile,
}: {
  dirPath: string
  agentId: string
  listings: Record<string, FolderEntry[]>
  expanded: Record<string, boolean>
  selectedPath?: string
  onToggle: (p: string) => void
  onOpenFile: (agentId: string, entry: FolderEntry) => void
}) {
  const entries = listings[dirPath]
  if (!entries) return <p className="px-2 py-1.5 text-xs text-muted-foreground">Reading…</p>
  if (entries.length === 0) return <p className="px-2 py-1.5 text-xs text-muted-foreground">Empty.</p>

  return (
    <>
      {entries.map((entry) =>
        entry.kind === "folder" ? (
          <div key={entry.path}>
            <button
              onClick={() => onToggle(entry.path)}
              aria-expanded={!!expanded[entry.path]}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {expanded[entry.path] ? (
                <ChevronDown className="size-3.5 shrink-0" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0" />
              )}
              <Folder className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            </button>
            {expanded[entry.path] && (
              <div className="ml-2 border-l border-border pl-1.5">
                <FolderTree
                  dirPath={entry.path}
                  agentId={agentId}
                  listings={listings}
                  expanded={expanded}
                  selectedPath={selectedPath}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                />
              </div>
            )}
          </div>
        ) : (
          <button
            key={entry.path}
            onClick={() => onOpenFile(agentId, entry)}
            title={entry.name}
            className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pl-1 pr-2 text-left text-xs transition-colors ${
              selectedPath === entry.path
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="run-gutter" aria-hidden="true" />
            <FileText className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
        )
      )}
    </>
  )
}

/**
 * The folder a skill lives in, or undefined if this file is not a skill.
 *
 * A skill is a directory — `.claude/skills/<name>/SKILL.md` plus whatever
 * `references/` it ships — while the tree selects the file inside it. Removing
 * a skill therefore means removing the folder; deleting SKILL.md alone leaves
 * the folder behind and the skill half-present. Commands are single `.md` files
 * and get no folder, which is why this returns undefined for them and the
 * ordinary Delete covers those.
 */
export function skillDirOf(filePath: string): string | undefined {
  const match = /^(.*\/\.claude\/skills\/[^/]+)\/SKILL\.md$/.exec(filePath)
  return match ? match[1] : undefined
}

/** How long ago, in the fewest words that are still true. */
function ago(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? "yesterday" : `${days}d ago`
}

type GutterState = "running" | "waiting" | "ran" | "never"

/**
 * The one workspace. The right-hand pane is whichever of three things you are
 * looking at — every company, one company, or one file — and the explorer on
 * the left belongs to the company you are IN, so it only exists once one is
 * open. The overview is the cards alone: the tree there was a second, denser
 * copy of the same list, and a card is now what opens a company.
 *
 * **This is the merge.** `/` was a company's status and configuration and
 * `/skills` was that same company's files; nothing linked them, so you held
 * "which page has the thing I want" in your head permanently. Now the tree
 * picks the subject and the right-hand pane follows it.
 *
 * The overview grid and each company's panel are **rendered on the server and
 * handed in as nodes**, keyed by agent id. That is deliberate and load-bearing:
 * `AgentCard` is a server component (it reads `os.homedir()`) carrying thirteen
 * controls, so passing it in whole is what lets the merge happen without
 * porting or reimplementing any of them.
 *
 * The grid gets `tiles` and the panel gets `panels` — the same card with and
 * without those controls. A grid of thirteen-control cards was a wall of
 * buttons for companies you were not working on; the controls belong to the
 * company you have opened, which is what the card is now a way of doing.
 *
 * A SEARCH still lists every company rather than only the focused one. That
 * keeps `/skills`'s cross-company search working — searching for a file whose
 * name you remember, without first remembering which company owns it, is a
 * real thing this page could do and must not lose. It is the one thing that
 * widens the tree past the company you are in.
 */
export function Workspace({
  results,
  entries,
  panels,
  tiles,
  appManagedPaths = [],
  pendingKeys = [],
  departmentByPath = {},
  runSignals = {},
  avatarByAgentId = {},
  initialCompanyId = null,
  onOpenCompany,
  shareLinks = [],
}: {
  results: SkillAgentResult[]
  entries: SkillEntry[]
  /** agentId -> that company's server-rendered AgentCard, controls and all. */
  panels: Record<string, ReactNode>
  /** The same card WITHOUT its controls, for the overview grid. */
  tiles: Record<string, ReactNode>
  /** Skills the app installed and updates — read-only (see lib/vendored-skills.ts). */
  appManagedPaths?: string[]
  /** "<agentId>:<commandId>" for every run whose result is still unapproved. */
  pendingKeys?: string[]
  /** Path -> department, from lib/skills/departments.ts. Anything absent is the user's own. */
  departmentByPath?: Record<string, string>
  /** "<agentId>:<commandId>" -> when it last ran, and whether it runs now. */
  runSignals?: RunSignals
  /** Map of agentId to uploaded avatar/logo dataUrl or imageUrl. */
  avatarByAgentId?: Record<string, string>
  /** Company the right-hand pane opens focused on. Null = the overview grid.
   *  Set by `/c/[companyId]/files`; unset at `/`. */
  initialCompanyId?: string | null
  /** When set, a tile click enters that company's OS route instead of
   *  focusing it in-page — the front door's "pick a company" action. Passed
   *  only from the true `/` picker; the files page's "switch company" grid
   *  leaves `openCompany`'s in-page focus alone. */
  onOpenCompany?: (agentId: string) => void | Promise<void>
  /** The strings between companies, drawn over the overview grid. */
  shareLinks?: ShareLink[]
}) {
  const appManaged = new Set(appManagedPaths)
  // Where the user has filed things, over the top of what the packs say.
  // Read client-side only: localStorage doesn't exist during SSR, and the
  // derived department is a correct first paint on its own.
  const [overrides, setOverrides] = useState<DepartmentOverrides>({})
  useEffect(() => setOverrides(loadOverrides()), [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault()
        setShowTerminal((open) => !open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /**
   * Get Started asks for this company's terminal.
   *
   * An event rather than a prop because AgentCard is rendered on the SERVER and
   * handed to this component as an opaque node — there is nothing to thread a
   * callback through. The company is switched first, so pressing Get Started on
   * a company you are not currently looking at opens ITS terminal rather than
   * whichever one happened to be on screen.
   */
  useEffect(() => {
    function onOpenTerminal(event: Event) {
      const { agentId } = (event as CustomEvent<OpenTerminalDetail>).detail ?? {}
      if (!agentId) return
      setCompanyId(agentId)
      setSelected(null)
      setShowTerminal(true)
    }
    window.addEventListener(OPEN_TERMINAL_EVENT, onOpenTerminal)
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, onOpenTerminal)
  }, [])

  const derivedDepartmentOf = (entry: SkillEntry) => departmentByPath[entry.path] ?? GENERAL_DEPARTMENT
  const departmentOf = (entry: SkillEntry) => overrides[entry.path] ?? derivedDepartmentOf(entry)

  function fileUnder(entry: SkillEntry, department: string) {
    setOverrides((current) => {
      const next = nextOverrides(current, entry.path, department, derivedDepartmentOf(entry))
      saveOverrides(next)
      return next
    })
  }
  const pending = new Set(pendingKeys)
  const [selected, setSelected] = useState<SkillEntry | null>(null)
  /** Which company the right-hand pane is about. Null = show them all. */
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId)
  const [detail, setDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [view, setView] = useState<"content" | "edit" | "history" | "run">("content")
  const [query, setQuery] = useState("")
  // Closed until asked. Keyed by what's OPEN, so the empty default is
  // "all closed" rather than a lookup that has to remember to invert.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  /** "By department" is exactly what shipped before this; "All files" is the
   *  real folder tree. Curated stays the default so nothing changes for anyone
   *  who never opens the toggle. */
  const [mode, setMode] = useState<"curated" | "all">("curated")
  /** Directory path -> its contents, filled in on expand. One level at a time:
   *  a company holds a git repo and possibly a node_modules, and the only way a
   *  tree stays cheap is by never reading a folder nobody opened. */
  const [listings, setListings] = useState<Record<string, FolderEntry[]>>({})
  /** Whether the workbench is showing this company's terminals instead of a
   *  file or the company itself. Closed until asked. See
   *  components/terminal-workspace.tsx for why it ships to everyone rather
   *  than hiding behind Advanced mode. */
  const [showTerminal, setShowTerminal] = useState(false)
  /** How many terminals this company has running, for the Terminal row's
   *  "running…" tell. 0 when nothing is up or nothing is open. */
  const [liveTerminals, setLiveTerminals] = useState(0)
  const detailRef = useRef<HTMLElement | null>(null)

  /**
   * Poll this company's live terminal count while the panel is CLOSED.
   *
   * Polled rather than remembered because the ptys outlive the page: a session
   * that ends while you are looking at the company would leave a remembered
   * count claiming "running…" forever, and a badge that lies about a running
   * process is worse than no badge. `?list=1` reads an in-memory Map — no
   * subprocess, unlike the CLI probes v70 had to memoize — so 4s is cheap.
   *
   * Only while closed, and only with a company open: when the panel is open you
   * are looking at the tabs themselves, so there is nothing for a badge to add.
   */
  useEffect(() => {
    if (companyId === null || showTerminal) {
      setLiveTerminals(0)
      return
    }
    let cancelled = false
    const read = async () => {
      try {
        const res = await fetch(`/api/terminal/${encodeURIComponent(companyId)}?list=1`)
        const { sessions } = (await res.json()) as { sessions: unknown[] }
        if (!cancelled) setLiveTerminals(Array.isArray(sessions) ? sessions.length : 0)
      } catch {
        // Server gone or the route errored — say nothing rather than guess.
        if (!cancelled) setLiveTerminals(0)
      }
    }
    void read()
    const onStatusChange = () => void read()
    window.addEventListener(TERMINAL_STATUS_CHANGED_EVENT, onStatusChange)
    const timer = setInterval(() => void read(), 4000)
    return () => {
      cancelled = true
      window.removeEventListener(TERMINAL_STATUS_CHANGED_EVENT, onStatusChange)
      clearInterval(timer)
    }
  }, [companyId, showTerminal])

  /** The root of whichever company the pane is about — the base every move is
   *  expressed relative to, and where a new file lands from the company panel. */
  const companyRoot = results.find((r) => r.agent.id === (selected?.agentId ?? companyId))?.agent.rootPath
  const focusedResult = companyId ? results.find((r) => r.agent.id === companyId) : undefined

  /** A file operation changes the real folder, so every cached listing is now a
   *  claim about a directory that may have moved.
   *
   *  Re-READ them rather than dropping them: nothing re-fetches a folder that is
   *  already expanded, so clearing the cache left every open folder showing
   *  "Reading…" forever. Only what is currently open is re-read, and a folder
   *  that no longer exists falls out of the map on its own. */
  async function refreshListings() {
    const open = Object.keys(listings)
    if (open.length === 0) return
    const reread = await Promise.all(open.map(async (dir) => [dir, await listFolder(dir)] as const))
    setListings(
      Object.fromEntries(
        reread.flatMap(([dir, result]) => ("entries" in result ? [[dir, result.entries]] : []))
      )
    )
  }

  const selectedAgent = selected ? results.find((r) => r.agent.id === selected.agentId)?.agent : undefined
  const matchedCompanyCommand =
    selected && selectedAgent?.kind === "command-set"
      ? COMPANY_COMMANDS.find((c) => c.commandFileName === commandFileNameOf(selected.path))
      : undefined

  // Same filename match the Run tab uses to find a command's registry entry —
  // the tree only knows files, the signals only know command ids.
  function commandIdFor(entry: SkillEntry): string | undefined {
    return COMPANY_COMMANDS.find((c) => c.commandFileName === commandFileNameOf(entry.path))?.id
  }

  /**
   * The run gutter — the one thing this page is remembered by.
   *
   * A command carries its last outcome as a tick in the tree; a skill carries
   * nothing, because a skill doesn't run. The tick's PRESENCE is the statement
   * "this is a thing that runs", which is why absence is not a fifth state.
   *
   * There is no "failed" here on purpose: nothing on disk records a non-zero
   * outcome (see lib/company-commands/run-signals.ts), and inferring failure
   * from agent prose would eventually mark a good run bad.
   */
  function gutterFor(entry: SkillEntry): { state: GutterState; title: string } | null {
    const commandId = commandIdFor(entry)
    if (!commandId) return null
    const key = `${entry.agentId}:${commandId}`
    const signal = runSignals[key]
    if (signal?.running) return { state: "running", title: "Running right now" }
    if (pending.has(key)) return { state: "waiting", title: "Finished — changes are waiting for you to approve" }
    if (signal?.lastRunAt) return { state: "ran", title: `Last run ${ago(signal.lastRunAt)}` }
    return { state: "never", title: "Never run" }
  }

  const q = query.trim().toLowerCase()
  const visible = q
    ? entries.filter((e) => e.name.toLowerCase().includes(q) || (e.description ?? "").toLowerCase().includes(q))
    : entries

  async function openEntry(entry: SkillEntry) {
    setSelected(entry)
    setCompanyId(entry.agentId)
    setShowTerminal(false)
    // Below `md` the panes stack, so the file you just tapped opens off-screen
    // under a tree that can be 17 rows long. Desktop is unaffected: the pane is
    // already in view, and scrollIntoView on an in-view element is a no-op.
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    setDetail(null)
    setDetailError(null)
    setView("content")
    const result = await getActivityDetail(entry.path)
    if (result.ok) setDetail(result.content)
    else setDetailError(result.message)
  }

  async function toggleFolder(dirPath: string) {
    const isOpen = !!expanded[dirPath]
    setExpanded((e) => ({ ...e, [dirPath]: !isOpen }))
    if (isOpen || listings[dirPath]) return
    const result = await listFolder(dirPath)
    if ("entries" in result) setListings((l) => ({ ...l, [dirPath]: result.entries }))
  }

  /** A file the tree found on disk rather than through a skill adapter. It gets
   *  the same viewer, but no Edit tab: `resolveWritableSkillPath` only accepts
   *  discovered skill and command files, and that membership gate is the app's
   *  standing rule. Editing anything else is what the terminal is for. */
  function openLooseFile(agentId: string, entry: FolderEntry) {
    void openEntry({ id: entry.path, agentId, kind: "skill", name: entry.name, description: "", path: entry.path })
  }

  /** Opening a company shows the company, not whatever file was last open. */
  function openCompany(agentId: string) {
    setCompanyId(agentId)
    setSelected(null)
    setShowTerminal(false)
    const root = results.find((r) => r.agent.id === agentId)?.agent.rootPath
    if (mode === "all" && root) {
      if (!expanded[root]) void toggleFolder(root)
    } else {
      setExpanded((e) => ({ ...e, [agentId]: true }))
    }
    detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function showEveryCompany() {
    setCompanyId(null)
    setSelected(null)
    setShowTerminal(false)
  }

  // The focused company's tree renders unconditionally open (no chevron of
  // its own to click) — so switching the mode tab to "All files" while
  // already focused has to fetch the root listing itself, the same fetch
  // openCompany() does when a company is opened while already in that mode.
  useEffect(() => {
    if (mode !== "all" || !companyId) return
    const root = results.find((r) => r.agent.id === companyId)?.agent.rootPath
    if (root && !expanded[root]) void toggleFolder(root)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the mode/company switch should trigger this, not every listings or expanded change
  }, [mode, companyId])

  const tab = (id: typeof view, label: string) => (
    <button
      key={id}
      onClick={() => setView(id)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        view === id
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      className={`dash-content workspace-page grid gap-4 pb-12 ${
        companyId === null
          ? // Overview: cards only, full width.
            ""
          : "md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
      }`}
    >
      {/* ---------------------------------------------------------- tree */}
      {/* Only once a company is open. On the overview the tree was a second,
          denser copy of the same list the cards already are — pick a company
          from the cards, and its files appear here. */}
      {companyId !== null && (
      <aside className="workspace-explorer rounded-xl border border-border">
        <div className="border-b border-border p-2">
          {/* Once a company is focused, the header becomes a switcher for
              THAT company rather than staying a plain "back to the list" nav
              item — matches the reviewed workspace prototype's `.co-switch`.
              Clicking it returns to the full list, which is also how you'd
              pick a different one. */}
          {companyId !== null && focusedResult ? (
            <button onClick={showEveryCompany} className="workspace-switcher" title="Switch company">
              {avatarByAgentId[focusedResult.agent.id] ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded company logo
                <img
                  src={avatarByAgentId[focusedResult.agent.id]}
                  alt=""
                  className="size-[26px] rounded-[7px] object-cover ring-1 ring-border shrink-0"
                />
              ) : (
                <span className="workspace-switcher-glyph">
                  {focusedResult.agent.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-display text-[13px] font-bold">{focusedResult.agent.name}</span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground">
                  {focusedResult.agent.rootPath}
                </span>
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <button
              onClick={showEveryCompany}
              aria-current={companyId === null ? "true" : undefined}
              className={`mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                companyId === null ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">All companies</span>
              <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{results.length}</span>
            </button>
          )}
          {companyRoot && (
            <button
              onClick={() => setShowTerminal((open) => !open)}
              aria-current={showTerminal ? "true" : undefined}
              title={showTerminal ? "Back to the company" : "Open this company's terminals"}
              className={`mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                showTerminal
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <TerminalIcon className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Terminal</span>
              {/* The tell, and it replaces the shortcut rather than joining it:
                  a live session is the more useful thing to know, and both at
                  this width truncates the label. */}
              {liveTerminals > 0 ? (
                <span className="terminal-running shrink-0">
                  running{liveTerminals > 1 ? ` ×${liveTerminals}` : ""}…
                </span>
              ) : (
                <kbd className="shrink-0 rounded border border-border px-1 py-0.5 font-mono text-[9px] font-normal text-muted-foreground">
                  ⌘J
                </kbd>
              )}
            </button>
          )}
          <div className="mb-2 flex gap-0.5 rounded-md border border-border p-0.5">
            {(["curated", "all"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "curated" ? "By department" : "All files"}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search every company"
              className="h-8 pl-7 text-xs"
              aria-label="Search skills and commands"
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-1.5">
          {/* Once a company is focused (the switcher above), the tree is
              ITS tree, not a list of every company with one row expanded —
              matches the prototype's "explorer shows the current company"
              rule. The switcher pill is what changes company; a row for it
              here would be a second, redundant control for the same move. */}
          {(companyId === null || q ? results : results.filter((r) => r.agent.id === companyId)).map((result) => {
            const owned = visible.filter((e) => e.agentId === result.agent.id)
            // A search that matches nothing in this company hides it entirely —
            // an empty folder is noise when you're looking for one file.
            if (q && owned.length === 0) return null
            // A search whose matches are hidden behind a closed folder is a
            // search that found nothing, so searching opens them.
            // Two key spaces in one map, on purpose: the curated tree has no
            // path to key on, and the folder tree must use the SAME key its own
            // children do or expanding a company would never load its root.
            const companyKey = mode === "all" ? result.agent.rootPath : result.agent.id
            const focused = companyId === result.agent.id
            const isExpanded = focused || !!expanded[companyKey] || q !== ""
            const isCurrentCompany = focused && selected === null
            return (
              <div key={result.agent.id} className="mb-1">
                {!focused && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() =>
                        mode === "all"
                          ? void toggleFolder(result.agent.rootPath)
                          : setExpanded((e) => ({ ...e, [companyKey]: !e[companyKey] }))
                      }
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse ${result.agent.name}` : `Expand ${result.agent.name}`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                    </button>
                    {/* Separate from the chevron on purpose: opening a company and
                        expanding its folder are two different intentions, and one
                        button doing both means you cannot look inside a company
                        without also changing what the right-hand pane is about. */}
                    <button
                      onClick={() => openCompany(result.agent.id)}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-semibold transition-colors ${
                        isCurrentCompany ? "bg-primary/15 text-foreground" : "hover:bg-muted"
                      }`}
                    >
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{result.agent.name}</span>
                      <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{owned.length}</span>
                    </button>
                  </div>
                )}

                {isExpanded && mode === "all" && (
                  <div className={focused ? "" : "ml-2 border-l border-border pl-1.5"}>
                    <FolderTree
                      dirPath={result.agent.rootPath}
                      agentId={result.agent.id}
                      listings={listings}
                      expanded={expanded}
                      selectedPath={selected?.path}
                      onToggle={toggleFolder}
                      onOpenFile={openLooseFile}
                    />
                  </div>
                )}

                {isExpanded && mode === "curated" && (
                  <div className={focused ? "" : "ml-2 border-l border-border pl-1.5"}>
                    {result.error && (
                      <p className="px-2 py-1.5 text-xs text-destructive">Source unavailable: {result.error}</p>
                    )}
                    {!result.error && owned.length === 0 && (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing installed yet.</p>
                    )}
                    {/* Grouped by department rather than by kind: a company holding
                        three packs has 30-odd files, and one alphabetical list put
                        `analytics` next to `api-designer`. Kind is still legible —
                        it's the row icon, and the badge on the open file. */}
                    {DEPARTMENT_ORDER.map((department) => {
                      const inDept = owned
                        .filter((e) => departmentOf(e) === department)
                        // Commands first: what this department DOES, then what it
                        // knows. Stable, so the name sort underneath survives.
                        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "command" ? -1 : 1))
                      if (inDept.length === 0) return null
                      return (
                        <div key={department} className="mt-1">
                          <p className="flex items-center gap-2 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            <span className="min-w-0 flex-1 truncate">{department}</span>
                            <span className="shrink-0 font-normal">{inDept.length}</span>
                          </p>
                          {inDept.map((entry) => {
                            const active = selected?.id === entry.id
                            const gutter = gutterFor(entry)
                            return (
                              <button
                                key={entry.id}
                                onClick={() => openEntry(entry)}
                                title={entry.name}
                                className={`flex w-full items-center gap-1.5 rounded-md py-1.5 pl-1 pr-2 text-left text-xs transition-colors ${
                                  active
                                    ? "bg-primary/15 text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                }`}
                              >
                                {/* The gutter. A command carries its last outcome;
                                    a skill carries nothing, because a skill does
                                    not run. Never colour alone (v85): the title
                                    says it in words, and the waiting state also
                                    pulses rather than only being amber. */}
                                <span
                                  className={`run-gutter${gutter ? ` run-gutter--${gutter.state}` : ""}`}
                                  title={gutter?.title}
                                  aria-hidden="true"
                                />
                                {entry.kind === "command" ? (
                                  <TerminalIcon className="size-3.5 shrink-0" />
                                ) : (
                                  <BookOpen className="size-3.5 shrink-0" />
                                )}
                                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                                {/* AFTER the name, deliberately. This text joins the
                                    row's accessible name, and a status read before
                                    the filename makes every row announce its state
                                    first and what it is second. */}
                                {gutter && <span className="sr-only">{gutter.title}</span>}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
      )}

      {/* -------------------------------------------------------- detail */}
      <section ref={detailRef} className="min-w-0 scroll-mt-4">
        {/* --- this company's terminals --- */}
        {showTerminal && companyId !== null && (
          <TerminalWorkspace
            agentId={companyId}
            companyName={results.find((r) => r.agent.id === companyId)?.agent.name ?? "this company"}
            onEmpty={() => setShowTerminal(false)}
          />
        )}

        {/* --- every company --- */}
        {!showTerminal && companyId === null && (
          <div className="workspace-grid">
            <CompanyStrings links={shareLinks} companies={results.map((r) => ({ id: r.agent.id, name: r.agent.name }))}>
            <ReorderableGrid
              items={results.map((r) => ({
                id: r.agent.id,
                node: (
                  <div
                    data-company-id={r.agent.id}
                    className="relative h-full cursor-pointer"
                    onClick={(e) => {
                      // The card carries its own thirteen controls. A click that
                      // landed on one of them was aimed at it, not at the card.
                      if ((e.target as HTMLElement).closest("button, a, input, select, textarea, summary, label")) return
                      if (onOpenCompany) void onOpenCompany(r.agent.id)
                      else openCompany(r.agent.id)
                    }}
                  >
                    {/* The pointer target is the whole card, which cannot also be
                        the keyboard target: a focusable wrapper around a dozen
                        buttons is a tab stop that announces nothing and traps
                        nobody's attention usefully. This is the real control —
                        invisible until focused, then a normal visible button. */}
                    <button
                      onClick={() => (onOpenCompany ? void onOpenCompany(r.agent.id) : openCompany(r.agent.id))}
                      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-md focus:bg-primary focus:px-2 focus:py-1 focus:text-xs focus:font-medium focus:text-primary-foreground"
                    >
                      Open {r.agent.name}
                    </button>
                    {tiles[r.agent.id] ?? null}
                    <ShareHandle companyId={r.agent.id} companyName={r.agent.name} />
                  </div>
                ),
              }))}
            />
            </CompanyStrings>
          </div>
        )}

        {/* --- one company --- */}
        {!showTerminal && companyId !== null && selected === null && (
          <div className="workspace-panel space-y-3">
            {companyRoot && (
              <FileActions companyRoot={companyRoot} parentPath={companyRoot} onDone={() => void refreshListings()} />
            )}
            {panels[companyId] ?? null}
          </div>
        )}

        {/* --- one file --- */}
        {!showTerminal && selected !== null && (
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                {selectedAgent && (
                  <p className="mb-1 truncate font-mono text-[10.5px] text-muted-foreground">
                    {selectedAgent.name} <b className="text-muted-foreground/70">/</b> {departmentOf(selected)}{" "}
                    <b className="text-muted-foreground/70">/</b> {selected.name}
                  </p>
                )}
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="min-w-0 truncate font-display text-lg font-bold">{selected.name}</h2>
                  <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                    {selected.kind}
                  </Badge>
                  {/* A native select rather than dragging rows in the tree: it is
                      keyboard- and touch-reachable for free, and it is the only
                      version of this that announces the feature exists. Filing is
                      per browser and touches no file — see department-overrides.ts. */}
                  <label className="flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="sr-only sm:not-sr-only">Department</span>
                    <select
                      value={departmentOf(selected)}
                      onChange={(e) => fileUnder(selected, e.target.value)}
                      className="rounded-md border border-border bg-card px-1.5 py-0.5 text-xs normal-case tracking-normal text-foreground"
                    >
                      {DEPARTMENT_ORDER.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {selected.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{selected.description}</p>
                )}
                {companyRoot && (
                  <div className="mt-2.5">
                    <FileActions
                      companyRoot={companyRoot}
                      parentPath={selected.path.slice(0, selected.path.lastIndexOf("/"))}
                      selectedPath={selected.path}
                      selectedName={selected.name}
                      canModifySelection={!appManaged.has(selected.path)}
                      skillDir={skillDirOf(selected.path)}
                      skillIsAppManaged={appManaged.has(selected.path)}
                      onDone={() => {
                        setSelected(null)
                        void refreshListings()
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 gap-1 rounded-lg border border-border p-1">
                {tab("content", "Read")}
                {!appManaged.has(selected.path) && tab("edit", "Edit")}
                {tab("history", "History")}
                {matchedCompanyCommand && tab("run", "Run")}
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-4">
              {appManaged.has(selected.path) && (
                <p className="mb-3 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                  Kept up to date by Alacrán — new versions arrive with app updates, so this one
                  isn&apos;t editable. Copy it to a new name if you want your own version.
                </p>
              )}
              {(view === "content" || view === "edit") && (
                <>
                  {detailError && <p className="text-sm text-destructive">{detailError}</p>}
                  {!detailError && detail !== null && (
                    <SkillEditor
                      path={selected.path}
                      initialContent={detail}
                      editing={view === "edit"}
                      onEditingChange={(editing) => setView(editing ? "edit" : "content")}
                      onSaved={(newContent) => setDetail(newContent)}
                    />
                  )}
                  {!detailError && detail === null && <p className="text-sm text-muted-foreground">Loading…</p>}
                </>
              )}
              {view === "history" && (
                <SkillHistory
                  path={selected.path}
                  currentContent={detail}
                  onReverted={(newContent) => {
                    setDetail(newContent)
                    setView("content")
                  }}
                />
              )}
              {view === "run" && matchedCompanyCommand && (
                <CompanyCommandRunner command={matchedCompanyCommand} agentId={selected.agentId} />
              )}
            </div>
          </div>
        )}
      </section>

    </div>
  )
}
