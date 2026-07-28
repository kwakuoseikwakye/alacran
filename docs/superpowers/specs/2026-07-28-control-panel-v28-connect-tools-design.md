# v28 — Connect page (detect → guide → re-check for Claude agent + Google)

**Status:** approved 2026-07-28. Part of the launch push (Day 3/4 golden-path
gap): a downloaded user should not have to guess how to connect their tools.

## Problem

Onboarding *promises* "connect your own AI agent" and "connect Gmail /
Calendar," but no in-app guidance exists — connecting still requires dropping
to a terminal blind. This is the one genuine in-app break on the buy→launch→
create-company→**connect Google**→run-`check-inbox` golden path.

## Key finding (why this is detect-and-guide, not a magic button)

Investigated the real mechanics:

- **Claude agent** = the `claude` CLI (Claude Code) installed + logged into a
  Claude subscription. Detection = `which claude`. Login state is **not**
  detectable non-interactively; the honest proof of login is running a command.
- **Google** = `gog auth setup`, an **interactive OAuth + Google Cloud flow**
  that opens a browser for consent. The app *cannot* perform OAuth for the
  user. But `gog auth status -j` returns clean JSON
  (`account.email`, `account.credentials_exists`) with **no tokens** — so the
  app *can* reliably detect connection state.
- `api-connect` (a template skill) is a heavyweight, agent-driven, browser-using
  concierge for connecting *any* service — not something the dashboard invokes.
- Both `gog` auth and `claude` login are **machine-global** (gog uses a
  per-machine auth store with `-a auto`), so connection status is a machine
  truth, not per-company.

Therefore v1 is **detect → guide → re-check**: show real status; when not
connected, show the exact terminal command with a copy button + a Re-check
button. Matches the locked audience decision (CLI-comfortable, detect-and-guide,
no auto-install) and v19's "connecting is an OS-level CLI thing" finding.

## Decisions (from brainstorming, 2026-07-28)

- **Scope:** Google (gog) **and** the Claude agent, both actionable (detect +
  guide + re-check). Slack/Notion/GitHub are out of scope (no consumer yet).
- **Placement:** a dedicated global **`/connect`** page, linked in the top nav
  and surfaced from onboarding. One machine-level source of truth.
- **No "Test agent" button** — we detect Claude *installed*, not *logged in*;
  the honest proof of login is running a company command. No `claude -p` spawn
  anywhere (honors the standing "never auto-trigger a real claude spawn" rule).

## Architecture

Mirror the existing `checkDependencies` pattern exactly.

- **`lib/connect/connect-status-impl.ts`** — pure logic + injectable
  `ExecFileFn` (default = real `execFile`). Exports:
  - `type ToolStatus = { id: "claude" | "google"; label: string; connected: boolean; detail: string; guidance: { steps: string[]; command?: string; link?: string } }`
  - `type ConnectStatus = { claude: ToolStatus; google: ToolStatus }`
  - `getConnectStatusImpl(execFn?): Promise<ConnectStatus>`
    - **claude:** `which claude` → connected = installed. Not installed →
      guidance to install Claude Code (+ link). Installed → detail: "Installed —
      run any company command to confirm your Claude login."
    - **google:** run `gog auth status -j`, `JSON.parse`; connected =
      `account.credentials_exists === true && account.email` non-empty →
      detail `Connected as <email>`. gog missing (execFn throws) / no account /
      bad JSON → not connected + guidance (`gog auth setup`, or install gog if
      missing).
    - Each probe independently try/caught; one failing never breaks the other.
- **`lib/connect/connect-actions.ts`** — `"use server"` `getConnectStatus()`
  calling the impl with the real default. Zero extra params (seam stays in impl).
- **`app/connect/page.tsx`** — `export const dynamic = "force-dynamic"`; server
  component fetches initial status (no loading flash), renders `<ConnectPanel>`.
- **`components/connect-panel.tsx`** (client) — two tool cards: status badge
  (Connected / Not connected), detail, and when not connected the exact command
  in a `<code>` block + copy button + one-line why + external link. Global
  **Re-check** button re-invokes `getConnectStatus()`.
- **Edits:** add "Connect" to `components/nav.tsx`; add a "Connect your tools →"
  link to `components/onboarding-welcome.tsx`.

## Data flow

`/connect` (server, force-dynamic) → `getConnectStatus()` initial → `ConnectPanel`
(client) renders immediately → Re-check re-calls the action → impl runs
`which claude` + `gog auth status -j` → typed status back.

## Error handling

Impl guards every probe (execFn throw → connected:false + guidance; `JSON.parse`
wrapped). Client: shows the server-provided initial status; Re-check sets a
pending state; if the action throws, show a small "couldn't check — retry."

## Security

Read-only probes only (`which`, `gog auth status -j`). No writes → no path-guard
needed. No secrets rendered (JSON has no tokens; we show email + booleans only).
No OAuth, no credential storage. Never touch plh repos. Never edit
`components/ui/*`.

## Testing (vitest, fake `ExecFileFn`)

- both connected → google detail includes the email
- claude missing (`which` throws) → claude not connected + install guidance
- gog missing (execFn throws for gog) → google not connected + install guidance
- gog installed, no account (`credentials_exists:false` / empty email) → not
  connected + `gog auth setup` guidance
- malformed JSON → not connected, no crash

Existing 272 tests stay green. No real `claude`/`gog` spawns in tests.

## Definition of done

`/connect` shows real, machine-level connection status for the Claude agent and
Google, with copy-able connect commands and a working Re-check; reachable from
the nav and onboarding; all tests green; `tsc`/`build` clean; live-verified.
