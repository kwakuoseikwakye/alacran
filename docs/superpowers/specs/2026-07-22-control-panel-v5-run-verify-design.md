# AI-Native Control Panel — v5 Slice: Trigger `ai-company-starter-main`'s `/verify`

## Status
Approved for implementation planning (2026-07-22).

## Problem

The backlog's next item was "triggering `ai-company-starter-main`'s
slash-commands," flagged as bigger than v2's single-script trigger because
it means spawning real Claude Code sessions. Inspecting the actual 10
commands shows 9 are genuinely interactive, multi-turn dialogues
(`/decision`, `/retro`, `/define-company`, `/create-epic`, `/handoff`,
`/stock-note`, `/ingest-context`, `/digest`, `/office`) that need an
open-ended agent session — but `/verify` is different: its own file says
only "run `scripts/verify.py`, interpret PASS/WARN/FAIL/INFO, summarize for
the user." The mechanical action is just running an existing script.

Confirmed by direct inspection: `scripts/verify.py`'s own docstring states
it only reads `settings.json` and never rewrites it; `--json` produces
clean structured rows (`category`, `id`, `status`, `message`); `main()`
returns `0 if passed() else 1` (exit 0 = no FAIL rows, exit 1 = at least
one). A real run completed in about a second with 30 rows (18 PASS, 11
INFO, 1 FAIL).

This spec covers triggering exactly that one script directly — mirroring
how v2 triggered `poll.sh` directly rather than building a general
mechanism first. The other 9 commands, which need actual Claude Code
session spawning, remain explicitly deferred.

## Goals

- A "Run verify" control on the `ai-company-starter-main` card that runs
  `python3 scripts/verify.py --json` and shows the result.
- Since the script is read-only and completes in about a second, the
  button awaits the result synchronously (no lock-file/polling status
  needed, unlike v2's `poll.sh` trigger) and needs no confirmation dialog
  (unlike v2/v4's actual write actions) — running it has no side effects to
  confirm.
- A compact pass/fail summary inline on the card, with a way to view every
  row's category/id/status/message in detail.
- Handle BOTH exit codes correctly: exit 0 (all pass) and exit 1 (at least
  one FAIL) both produce valid JSON on stdout that must be parsed and
  shown — a nonzero exit is an expected, legitimate outcome to display, not
  a "the trigger itself broke" error.

## Non-goals

- No spawning of real Claude Code sessions for any of the 9 interactive
  commands (`/decision`, `/retro`, `/define-company`, `/create-epic`,
  `/handoff`, `/stock-note`, `/ingest-context`, `/digest`, `/office`) — a
  separate, larger mechanism, deferred.
- No AI-interpreted summary/remediation of FAIL rows (the full interactive
  `/verify` experience proposes fixes; this dashboard trigger only runs the
  check and shows raw structured results).
- No history of past verify runs — only the latest run's result is shown,
  discarded on page refresh.
- No changes to `scripts/verify.py` itself.
- No new file-read/write surface — this action's only interaction with the
  filesystem is spawning the script; it doesn't read or write any file
  directly itself.

## Architecture

```
lib/
├── run-verify-impl.ts   # injectable-exec implementation
└── run-verify.ts        # "use server" zero-extra-parameter action
components/
├── verify-result.tsx    # renders the row table (reused inside a Sheet)
└── verify-button.tsx    # "Run verify" button + summary + Sheet trigger
```

`lib/run-verify-impl.ts`:
```
type VerifyStatus = "PASS" | "WARN" | "FAIL" | "INFO"
type VerifyRow = { category: string; id: string; status: VerifyStatus; message: string }
type VerifyResult = { ran: boolean; passed: boolean; rows: VerifyRow[]; message: string }

type ExecFileFn = (command: string, args: string[], options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>

async function runVerifyImpl(execFn?: ExecFileFn): Promise<VerifyResult>
```

Follows the same dependency-injection pattern as `lib/adapters/launchd.ts`
and `lib/git-commit-file.ts`: a real default (`child_process.execFile`,
promisified) and an injectable fake for tests, so tests never spawn a real
`python3` process.

**Handling both exit codes**: Node's promisified `execFile` rejects on a
nonzero exit code, but the rejection error object carries `.stdout`/
`.stderr` populated from the process's actual output (documented Node
behavior). `runVerifyImpl` must catch that rejection and, if the error
object has a parseable `stdout`, treat it as a legitimate "ran, and found a
FAIL" result — not a trigger failure. Only a rejection with no parseable
JSON (script missing, `python3` not found, JSON literally malformed) is a
genuine `{ran: false, ...}` failure.

`lib/run-verify.ts` (`"use server"`): zero-parameter export
`runVerify(): Promise<VerifyResult>` delegating to `runVerifyImpl()` with
no extra parameter exposed on the action — same shape lesson already
applied consistently since v2's fix.

## UI

`VerifyButton` (client component), added to the `ai-company-starter-main`
card in `app/page.tsx`/`components/agent-card.tsx` (same conditional-slot
pattern already used for `launchdHealth`/`pollStatus` on the Takeshi
card):
- "Run verify" button, shows a spinner while the (synchronous, awaited)
  call is in flight.
- On completion: an inline summary (`"18 passed · 11 info · 1 failed"`,
  colored to reflect overall pass/fail) plus a "View details" button.
- "View details" opens a `Sheet` (same pattern as the activity/skill
  detail panels) rendering `VerifyResult`'s full row table, grouped or
  sorted by status with FAIL/WARN surfaced first.
- No confirmation dialog before running — this control triggers a
  read-only check with no side effects to confirm.

## Error handling

- Missing `ai-company-starter-main` agent config, `python3` not found, or
  `scripts/verify.py` missing → `{ran: false, passed: false, rows: [],
  message: <cause>}`, shown as an inline error rather than a crash.
- A `FAIL` result (script ran, exited 1, valid JSON) → `{ran: true, passed:
  false, rows: [...], message: "Some checks failed"}` — this is success
  from the trigger's own perspective (it ran and told you what happened),
  not a caught error.
- Malformed/unparseable JSON on stdout (a genuine change to `verify.py`'s
  output format, or a crash before it could print `--json` output) →
  `{ran: false, ...}` with the raw parse error as the message.

## Testing

- `run-verify-impl.test.ts`: injected fake `execFn` covering (a) exit 0
  with all-PASS JSON → `{ran:true, passed:true, rows:[...]}`; (b) a
  rejection whose error carries valid JSON on `.stdout` with at least one
  FAIL row → `{ran:true, passed:false, rows:[...]}`, proving exit 1 is
  handled as a legitimate result, not swallowed as a failure; (c) a
  rejection with no parseable stdout (e.g. "command not found") →
  `{ran:false, ...}`; (d) malformed JSON on a successful exit → `{ran:
  false, ...}`.
- Manual verification: click "Run verify" against the real
  `ai-company-starter-main`, confirm the real summary/row count appears
  (expect roughly 30 rows matching what was confirmed by direct CLI
  inspection), open "View details" and confirm real category/id/message
  values render, including whichever row is currently FAIL/WARN if any.

## Open items for v6+ (explicitly deferred, not decided here)

- Spawning real Claude Code sessions for the other 9 slash-commands.
- Triggering `plh-ops`'s daily-team-log on demand.
- Live log streaming.
- Reusable template mechanism for a second "AI company."
- Higgsfield avatars.
- Version-history/diff-browsing UI for skill edits; user-typed commit
  messages for skill edits.
