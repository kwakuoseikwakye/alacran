# v31 — Scheduled-runs toggle for the Takeshi agent

**Date:** 2026-08-04
**Status:** approved, not yet implemented

## Problem

The dashboard can start the `plh-takeshi-agent` poll and watch it, but it
cannot stop it. That agent's real recurring trigger is a launchd job
(`com.plh.takeshi-agent`, `StartInterval` 300s) installed outside every agent
root at `~/Library/LaunchAgents/com.plh.takeshi-agent.plist`. Today the card
shows a read-only status line — `launchd: loaded (last exit 0)` — produced by
`lib/adapters/launchd.ts`'s `checkLaunchdJob()`, which shells
`launchctl list <label>` and nothing else. Turning the schedule off requires
`launchctl unload` in a terminal.

This is the first slice of a larger effort to retire that bespoke bash daemon in
favour of Alacrán-native workflow commands. An off switch in the UI is the safe
precondition for that retirement: the operator can stop the automation before
anything is dismantled, without remembering launchctl invocations.

## Scope

In: an on/off control for the launchd job, with a confirm dialog in both
directions, on the `plh-takeshi-agent` card.

Out: killing an in-flight `poll.sh` run; editing the interval; generalising the
control to other agents; anything touching the email/GitHub triage workflow
(that is a later, separately-specced slice).

## Design

### Module

New `lib/scheduled-job/`:

- `set-scheduled-job-impl.ts` — `setScheduledJobImpl(enabled: boolean,
  execFileFn?: ExecFileFn)`. Shells `launchctl unload <plist>` when disabling
  and `launchctl load <plist>` when enabling. These are the exact commands the
  agent repo's own `install.sh` and `uninstall.sh` already use, so the toggle
  cannot drift from how that job was installed. Returns
  `{ ok: boolean; message: string }`; never throws.
- `set-scheduled-job.ts` — the `"use server"` wrapper, taking only
  `enabled: boolean`.

The launchd label and plist path are hardcoded module constants, never
parameters. This matters: the public Server Action is reachable by anything the
browser can reach, so accepting a caller-supplied label or path would let it
unload arbitrary launchd jobs. Following the project's zero-extra-parameter
convention here is also the security boundary — there is no path to guard
because no path crosses the boundary.

`lib/path-guard.ts` does not apply: this action writes no files and touches
nothing inside an agent root.

### State

No new state file. `checkLaunchdJob()`'s existing `loaded` field *is* the
toggle's position, so the control renders from data the page already fetches.
`lib/adapters/launchd.ts` is not modified.

### UI

The existing static status line on the Takeshi card becomes an interactive
control. Both directions confirm before acting, since both change whether real
automation runs unattended:

- **Turning off:** disclose that this stops *future* scheduled runs and that a
  run already in progress will finish normally.
- **Turning on:** disclose that the agent will resume polling every 5 minutes
  unattended.

"Run now" is unaffected and stays enabled either way — a manual trigger is
independent of the schedule. After a successful toggle the card's status
refreshes so the displayed state matches reality rather than the pre-action
snapshot (the same staleness class of bug v10 fixed for the Run-now button and
v7 fixed for the skill detail panel).

### Gating

The control renders only when both are true: `plh-takeshi-agent` is a present
existence-gated built-in, and the plist file exists. A fresh install has
neither, so it sees nothing.

Like v2 (Run now), v9 (daily-team-log trigger) and v19 (integration status),
this is deliberately bespoke to one agent id rather than generalised — the
population is one, and the job label is specific to it. If a second scheduled
agent ever exists, generalise then.

## Error handling

**The exit code is not the source of truth; the resulting state is.** After
running the command, re-check `checkLaunchdJob()` and compare `loaded` against
the requested state. Success means the job ended up in the state asked for,
regardless of exit code; failure means it did not, and then the message carries
the command's stderr when the command itself threw, or a mismatched-state
description otherwise.

This is not merely defensive — live verification (see Testing, below) showed
one direction of it is necessary. On macOS (observed on 26.2, via `sw_vers`),
a redundant `unload` on an already-unloaded plist prints `Unload failed: 5:
Input/output error` to stderr but **exits 0**, so `promisify(execFile)` —
which only rejects on a non-zero exit — never throws, and a stderr-only
failure would otherwise pass silently. That is the one exit-code anomaly
actually measured. The impl also tolerates a thrown error from `execFileFn`
(a missing plist, a permissions error, a different macOS version) as a
defensive catch-all for failure modes that were never observed to occur, not
because any of them is known to exit non-zero. Either way — the command
throws, or it exits 0 while failing — reading the resulting state back via
`checkLaunchdJob()` is the one check that covers both without needing to know
in advance which exit code a given failure produces. The displayed state
always comes from that read, never from an assumption about what the command
did, so a failed unload can never render as "off".

## Testing

Unit tests with an injected `execFileFn`: enable, disable, non-zero exit,
thrown-error path, and an assertion that the argv contains the hardcoded plist
path (guarding the constant against accidental parameterisation).

Live verification, per the user's explicit choice: create a disposable launchd
job (`com.alacran.testjob`, running `/usr/bin/true`), toggle it through the real
`launchctl` code path, confirm via `launchctl list` before and after, then
delete it. This proves the real launchctl path works **without touching the
Takeshi job**, honouring the standing safety rule that
`~/AI-Native/plh-takeshi-agent` is never mutated for verification. The real
button against the real job is left for the user to click.

**What the live verification actually found:** the "Error handling" section
above originally predicted that a redundant `unload` would exit non-zero. It
does not. The disposable job's already-unloaded `unload` exited **0** while
printing `Unload failed: 5: Input/output error` to stderr — the opposite of
the predicted direction, and a case a naive `promisify(execFile)` rejection
check would silently miss rather than misreport. No case of `launchctl`
exiting non-zero was ever observed in this test; the impl's handling of a
thrown error remains a defensive catch-all for that possibility, not a
documented behaviour. This is why "Error handling" above now treats the
resulting-state check as necessary for the one failure shape actually
measured, while still covering the unobserved one defensively. The real
Takeshi job's `checkLaunchdJob()` output was confirmed unchanged at three
checkpoints during the session; the toggle's confirm dialog was opened and
cancelled against the real card, never confirmed.

## Backup (done before this slice)

`~/AI-Native/.backups/plh-takeshi-agent-20260804.tar.gz` — the whole 1.8M
directory including `.git`, so all history plus `logs/`, `state/` and `reports/`
are restorable. Verified: 557 archive entries matching 557 on disk. The live
plist is alongside it as `com.plh.takeshi-agent.plist.20260804` (lints clean),
since this slice's whole purpose is manipulating that file's loaded state.

## Note found while investigating

`plh-takeshi-agent/claude-agent-settings.json` lines 26-27 point their
`PreToolUse` guardrail hook at `/Users/nanaosei/Kirirom/plh-takeshi-agent/bin/guardrail.sh`,
a pre-reorg path that no longer exists — that repo moved to `~/AI-Native/` on
2026-07-22. The guardrail has therefore been silently inactive since then, so
the daemon has been running with less protection than its config implies. Out of
scope for this slice (it is a fix in a repo this project must not mutate), but it
is a real finding and it strengthens the case for retiring that daemon rather
than repairing it.
