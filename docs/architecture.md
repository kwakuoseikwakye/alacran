# Architecture — as built

Describes what the code does **today** (v102, `package.json` 0.29.1). This is a
map, not a plan: nothing here is aspirational. For *why* a decision was made,
`CLAUDE.md` (standing rules) and `CHANGELOG.md` (per-slice history) are
authoritative; this file only says where things live and how they connect.

Verified against the tree on 2026-08-25: 102 test files, 753 tests, green.

---

## 1. What it is

A local-first Next.js app that manages "AI companies" — ordinary git
directories on the user's own machine — and runs a coding-agent CLI against
them under a sandbox the app defines. Nothing leaves the machine except the
agent's own account-bound API calls and the user's own GitHub/Google calls.
There is no server, no account, no telemetry.

Two processes, one machine:

```
  Native window                     Next.js server (localhost:4319)
  (WebKitGTK on Linux;      <---->   app/ + lib/, all "use server"
   Electron on mac, in a                        |
   separate project)              spawns: claude, gog, gh, git
          |
  scripts/webview-linux.py (Linux);
  the macOS shell's electron/main.js (mac)
```

---

## 2. Stack

| | |
|---|---|
| Framework | Next.js 15 App Router, React 19, all pages `export const dynamic = "force-dynamic"` |
| Styling | Tailwind v4, CSS custom properties in `app/globals.css`, dark-only |
| Server logic | Server Actions (`"use server"`) — 43 action files |
| Tests | vitest, no DOM, no network, no real subprocesses |
| Runtime deps | 10 total (`next`, `react`, `radix-ui`, `lucide-react`, `diff`, `yaml`, 4 css utils) |
| Build | `output: "standalone"` → packaged by `scripts/package-{macos,linux}.sh` |

Everything else — git, diffing state, process launching — is Node stdlib or a
shelled-out binary the user already has.

---

## 3. Layer map

```
                      app/*/page.tsx          (7 routes, server components)
                             |
                      components/*.tsx        (46, client where interactive)
                             |
                   ==== "use server" boundary ====
                             |
                      lib/<action>.ts         (public Server Action, domain params only)
                             |
                      lib/<action>-impl.ts    (52 files: same logic + injectable seams)
                             |
        +--------------------+--------------------+
        |            |            |               |
   path-guard   known-skill   run-lock      ai-executors
   (containment) (membership)  (mutex)      (which CLI, what flags)
        |            |            |               |
        +--------------------+--------------------+
                             |
                    spawn / execFile / fs
```

**The `-impl.ts` split is the testing seam.** A public action takes only real
domain parameters; its `-impl` twin takes the same parameters plus
`execFn` / `spawnFn` / `execFileFn` / `nowSeconds` / `dataDir` / `platform`
with real defaults. Tests call the impl with fakes. This is why the suite
never touches a real process or the real clock.

---

## 4. The agent model

`lib/adapters/types.ts` defines the whole domain object:

```ts
type Agent = { id, name, rootPath, kind }
type AgentKind = "pipeline" | "command-set" | "report-log" | "external"
```

Three sources merge in `lib/get-effective-agents.ts`:

| Source | File | Notes |
|---|---|---|
| Built-ins | `lib/config.ts`, `lib/builtin-agents.ts` | 2 agents, **existence-gated** on `~/AI-Native/*` — absent on a shipped install |
| Registered | `lib/companies-registry.ts` → `companies.json` | Any directory with `.git`; added via UI |
| — | | `external` kind skips even the `.git` check |

`getEffectiveAgents()` / `getEffectiveAdapters()` / `getEffectiveSkillAdapters()`
are the only correct way to enumerate. Registered companies fall back to
`genericGitLogActivityAdapter` and `genericCommandSetSkillAdapter`.

`kind` gates features in `app/page.tsx`. The convention is **every flag keys off
`isCommandSet`**, and a new kind opts in explicitly — never the reverse.
`lib/build-network-map.ts`'s last branch is a fall-through, not an exhaustive
`Record`, so a new `AgentKind` must be hand-checked there; `KIND_BADGE_CLASS` is
a real `Record` and does fail at `tsc`.

### Company data vs. adapter artifact

```
<company root>/
  definitions/   docs/   notes/     <- portable Alacrán data, agent-neutral
  .claude/                          <- Claude Code adapter artifact
```

`.claude/` is **not** required to register (v65). ~57 references across 28 files
touch it, nearly all a single `path.join(root, ".claude", …)` in a write path —
which is what an adapter is supposed to look like.

---

## 5. The executor seam

`lib/ai-executors.ts` — which CLI runs a company's commands.

```ts
type AiExecutor = {
  id, label, binaryName, installHint, installLink
  enforcesToolScope: boolean
  buildArgs: ({ prompt, editScopePattern, bashPatterns }) => string[]
  buildInteractiveIntroArgs?: (introPrompt: string) => string[]   // absent = can't be seeded
}
```

Two entries as of v102: `claude-code` and `kiro`. Assignment lives in
`ai-executors.json`, written by `setAiExecutorImpl` and chosen in
`components/ai-executor-picker.tsx` — **advanced-only**, since picking an AI
engine is exactly the decision the stated audience should not face. Unknown ids
resolve to the default rather than throwing, which is what let v99 delete three
executors with no migration and what still covers a pre-v99 disk naming one.

An executor's scope need not arrive in argv. Claude Code's does
(`Edit(pattern)`); Kiro's lives in an agent config file, written by
`prepareExecutorScope` in **`lib/executor-scope.ts`** after the run lock is held
and before the spawn — a throw there aborts the run rather than spawning
unscoped. That writer has its own module because `lib/ai-executors.ts` is
imported by client components for labels, so a `node:fs` import there passes
`tsc` **and** `vitest` and fails only `next build`.

Two capability flags carry real weight:

- **`enforcesToolScope`** — does `buildArgs` actually honour the edit/bash
  patterns, or only pass a coarse auto-approve flag? `runCompanyCommandImpl`
  **refuses** to run any command marked `untrustedInput` on an executor that
  reports `false`. Pinned by a test that proves the flag against real
  `buildArgs` output, not a hardcoded list.
- **`buildInteractiveIntroArgs?`** — optional. Absence means "this CLI can't be
  seeded", and callers fall back to a blank session rather than guessing a flag.

The run path never names a vendor: `executor.binaryName`, `executor.buildArgs()`.
The five remaining `=== "claude-code"` comparisons in product code are all
install/auth detection (`lib/is-claude-code-cli.ts`, which exists because
`which claude` also matches a Homebrew cask shim for the desktop app).

---

## 6. The command pipeline

The core loop. Six commands in `lib/company-commands/registry.ts`:
`orientation`, `digest`, `decision`, `retro`, `define-company`, `refresh`.

```
  user fills fields
        |
        v
  runCompanyCommand (Server Action)
        |
  [1] validate fields                      unknown key / required / 4000 char cap
  [2] resolve executor  ---- refuse if command.untrustedInput && !enforcesToolScope
  [3] acquireRunLock    ---- "Already running" if held  (lib/file-lock.ts)
  [4] runPrefetch       ---- gog/notion reads; failure releases lock, no spawn
  [5] snapshot "before" ---- written to <id>.run.json   (dir listing or file text)
  [6] buildPrompt + executor.buildArgs
        |
        +--> headless:  spawn detached, stdio -> <id>.log, exit releases lock
        +--> visible:   write args/prompt/script, launch a real Terminal window
        |               (the script's own `trap EXIT` releases the lock)
        v
  getCompanyCommandResult  -- diff before vs. now  (components/diff-view.tsx)
        |
        v
  user approves
        |
        v
  commitCompanyCommandResult -- cheap prefix check, THEN realpath gate,
                                then git-commit-file.ts (single-file scoped)
```

`outputKind` decides both the diff shape and the sandbox:

| `outputKind` | before-snapshot | `editScopePattern` |
|---|---|---|
| `new-file-in-dir` | `readdir()` of the dir | `<outputPath>/**` |
| `known-file` | file contents | `<outputPath>` |

So the agent's write allowlist is **derived from the same field** that decides
what the diff compares. They cannot drift.

The spawn is detached with `unref()`, so a run survives a page navigation. Both
`exit` **and** `error` listeners release the lock — a missing `error` listener
would crash the server *and* wedge the lock, since `lib/file-lock.ts` has no
staleness sweep.

---

## 7. Security layers

Five independent mechanisms. None is a subset of another.

**1. Path containment** — `lib/path-guard.ts`
`realpath()` both sides, then require the target to be inside a known agent
root. Symlink-safe by construction (macOS `/var` → `/private/var` is the case
that forces it).

**2. Skill membership** — `lib/resolve-known-skill.ts`
Containment alone would let any file in the repo be written. This additionally
requires the path to match a file the skill scanners actually discovered. Used
**together with** the guard on every write path.

**3. Tool scope** — `AiExecutor.enforcesToolScope` + `CompanyCommand.untrustedInput`
The layer that holds when a prompt-injection payload gets past the fence. Dead
today (one executor, and it enforces); kept deliberately, pinned by a test.

**4. Untrusted-input fence** — `lib/company-commands/prefetch/untrusted-fence.ts`
Wraps attacker-authored text (an email body, a Notion page title) in a
**per-run nonce** delimiter from `crypto.randomUUID()`. A fixed marker can be
closed early by the content itself; a nonce its author never saw cannot be
forged. The app emits this itself rather than trusting `gog --wrap-untrusted`
to have done it.
Rule: the fence belongs to the **use**, not the source. `check-notion` ships
page titles unfenced because its prompt only *lists* them; `refresh` reuses the
same prefetch to *edit a file* and wraps it itself.

**5. Single-file git commits** — `lib/git-commit-file.ts`
`git add -- <file> && git commit -m <msg> -- <file>`. Never a bare `git commit`,
which would sweep unrelated working-tree changes in the user's own repo.

Plus the run lock (`lib/company-commands/run-lock.ts`) — one run per company,
so two clicks can't race on the same output file.

---

## 8. State on disk

`lib/data-dir.ts` resolves one directory. It must **not** be inside the app
bundle — the packaged launcher `cd`s into `Contents/Resources/app`, and an
update replaces that wholesale.

```
$ALACRAN_DATA_DIR                                  (override, any platform)
~/Library/Application Support/Alacrán/             (macOS, production)
${XDG_DATA_HOME:-~/.local/share}/Alacrán/          (Linux, production)
<repo>/.data/                                      (development — gitignored)
```

Dev and production are **separate registries by design**. A company registered
via `next dev` is invisible in the installed app; that is not a bug, and it
looks exactly like one. A one-time best-effort `migrateLegacyData()` rescues
installs that wrote into the old in-bundle path.

| File | Holds |
|---|---|
| `companies.json` | registered companies (id, name, rootPath, kind?) |
| `ai-executors.json` | per-company executor assignment (read-only since v99) |
| `avatars.json` | per-company avatar |
| `visible-runs.json` | per-company "run in a visible Terminal" toggle |
| `schedules.json` / `schedules-last-run.json` | daily command schedules |
| `update-check.json` | last update check + cached release info |
| `company-runs/<agentId>/` | `<id>.run.json`, `<id>.log`, `run.lock`, run scripts |

---

## 9. UI surfaces

| Route | Shows |
|---|---|
| `app/page.tsx` | company cards — run commands, Get Started, Open in Terminal, backup, ownership |
| `app/skills/page.tsx` | skill tree, editor, history, Run tab (tree file → registry entry) |
| `app/activity/page.tsx` | git-log-derived activity, grouped by day |
| `app/network/page.tsx` | graph of every company and what it's plugged into |
| `app/connect/page.tsx` | per-tool cards: AI executor, Google, GitHub, Notion, MCP |
| `app/settings/page.tsx` | advanced mode, updates, theme |
| `app/layout.tsx` | sidebar / mobile bottom nav |

**Advanced mode** (`lib/advanced-mode.ts`, a localStorage boolean, default off)
hides the terminal-literate surface: Network tab, integration cards, MCP,
Open in Terminal, the path field. Binding rule: a new feature defaults to
**hidden**, and opts in.

`components/ui/*` are unmodified primitives. Styling problems get fixed at the
**token** or the **consumer**, never in a primitive.

`lib/exec-memo.ts` memoizes read-only probes (`which gog`, `gog auth list -j`,
`gh api user`) process-wide with a TTL. Not for CPU — every page is
`force-dynamic`, and `gog`'s ad-hoc code signature makes macOS re-prompt for
keychain access on every single call. "Re-check" clears the memo.

---

## 10. Scheduling

`lib/schedules/schedules-impl.ts`. Per-company, per-command, `"HH:MM"` local
time. `instrumentation.ts` starts a server-side ticker at boot that calls
`runDueSchedulesImpl()`, which runs due commands through the *same*
`runCompanyCommandImpl` — no second execution path.

- `skipDate` records the save date when the time had already passed that day,
  so saving "07:00" at 15:00 isn't instantly due.
- `autoCommit` is opt-in per schedule and **refused outright** for any command
  carrying `untrustedInput`.
- `pendingCommit` marks a run the ticker started, so the sweep never commits a
  run the *user* started and deliberately left unapproved.

---

## 11. Packaging, window, updates

Linux only, in this repo: `scripts/package-linux.sh` → `dist/alacran_*.deb`:
`.next/standalone` + `templates/` + `webview-linux.py` (WebKitGTK),
`Architecture: all` because the window is a script rather than a compiled
binary and there's no bundled `node` (Linux depends on the system's).

**mac packaging moved out of this repo on 2026-08-26**, to a separately maintained
macOS desktop shell:
an Electron shell, replacing the old compiled-Swift-WKWebView `.app`
(`docs/native-app.md` has the full reasoning for the exception). Its
`electron/main.js` spawns the same bundled vanilla Node binary running the
same `server.js` the old bash launcher did, so nothing about the payload or
`node-pty` changed — only the process that starts it and shows the window.

Things the window contract depends on (`docs/native-app.md`), and which side
owns each one now:

1. `lsof -ti tcp:PORT -sTCP:LISTEN` stale-instance clearing, escalating to
   `kill -9` — every site is `-sTCP:LISTEN`-scoped, not a bare `tcp:PORT`
   match, because that also matches **client** sockets (a browser tab with a
   live connection). Both `package-linux.sh`'s launcher and
   the macOS shell's `main.js` do this.
2. `target="_blank"` is inert in a bare webview unless the host handles it —
   `webview-linux.py` does; Electron's `setWindowOpenHandler` is the
   equivalent for the mac shell.
3. The window owns the app's lifetime both ways: closing it quits Alacrán (so
   schedules stop — minimise instead), and the launcher/main-process closes
   the window if the server dies, which is what an in-app update looks like
   from inside.

`lib/updates/` now only handles Linux: checks GitHub releases, downloads the
`.deb`, installs it via `pkexec`. mac updates itself independently, via
`electron-updater` inside the macOS shell — `canAutoUpdate()`
(`lib/updates/can-auto-update.ts`) is `false` on every platform except
`linux`, which is what keeps this codebase's own update UI from showing on
mac at all. Windows returns a clean "not available" rather than failing,
same as it always has.

---

## 12. Testing conventions

`npm test` → vitest, 753 tests across 102 files. No DOM, no network, no real
subprocess, no real clock.

- Inject `execFn` / `spawnFn` / `nowSeconds` at the `-impl` boundary.
- A refactor that moves shared logic must leave already-shipped test files
  passing **unchanged**, with at most one justified additive mock line.
- Invariants get pinned rather than commented: `ai-executors.test.ts` asserts
  every registered executor enforces a scope; `config.test.ts` fails if
  `AGENTS`/`ADAPTERS` drift.

Two standing rules the suite cannot enforce:

- **Never let an automated pass trigger a real headless `claude -p` to
  completion.** Verify up to "Started," then stop.
- **Scope every automated-test selector to the dialog under test.** A page-wide
  `querySelector` once hit an auto-saving picker on a card *behind* an open
  Sheet and committed a real file into a real repo.

---

## 13. Deliberately not abstracted

Recorded so it isn't re-litigated. Each is a real seam that does **not** exist,
and the reason it doesn't:

| Not built | Why |
|---|---|
| `BrowserProvider` interface | `claude --chrome` has no equivalent in any other CLI, Kiro included. One implementation. The caller gates on the executor id instead. |
| Tool / connector registry | Four integrations exist (gog, gh, Notion, MCP presets). Build from repeated behaviour, not a catalogue. |
| Portable skill format (`skill.yaml` + compiler) | The template's `.md` files are deliberately usable directly from a terminal. A compiler would take that away for a runtime that doesn't exist. |
| Generic plugin/workflow packaging | Investigated; the real ecosystem was too bespoke to justify a generic format. Still on the roadmap as *named, not designed*. |
| A unified `AgentPermissions` type | Would have to degrade to the weakest executor. The two registered executors express scope in different media (argv vs. a config file), which `prepareExecutorScope` handles without a shared vocabulary. |
| A capability matrix UI | One `limitations?: string[]` per executor, rendered by the picker. Prose the user reads at the moment of choosing beats a grid nobody maps onto their own question. |

The related standing rule: **ship only what has been run end to end.** Three
executors sat registered for ~30 slices with only `--help` verified and were
removed rather than left shipping untested. A verified `--help` is not a
verified capability — and v102 sharpened it: Kiro's own `agent validate` exits 0
on malformed JSON and accepts invented fields, so even a vendor's validator is
not a verified capability. Only a live run is.

---

## 14. Where to look first

| Question | File |
|---|---|
| What companies exist? | `lib/get-effective-agents.ts` |
| What can a command do? | `lib/company-commands/types.ts` + `registry.ts` |
| How does a run actually happen? | `lib/company-commands/run-company-command-impl.ts` |
| Which CLI, which flags? | `lib/ai-executors.ts` (isomorphic — no `node:fs` here) |
| How is the edit scope written? | `lib/executor-scope.ts` |
| Can this path be written? | `lib/path-guard.ts` + `lib/resolve-known-skill.ts` |
| Where is state? | `lib/data-dir.ts` |
| What runs unattended? | `instrumentation.ts` → `lib/schedules/schedules-impl.ts` |
| Why is it like this? | `CLAUDE.md`, then `CHANGELOG.md` |
