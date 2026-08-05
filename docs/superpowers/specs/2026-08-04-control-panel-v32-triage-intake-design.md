# v32 — Read-only triage intake: email and GitHub issues

**Date:** 2026-08-04
**Status:** approved, not yet implemented

## Problem

PLH work arrives as email from colleagues and as GitHub issues on the PLH product
repos. Today the only automation for it is `plh-takeshi-agent`, a bespoke bash
daemon polling every 5 minutes that runs a six-role agent team, writes code on a
branch and opens a PR — driven entirely from a terminal, with no UI. v31 gave
that daemon a stop switch. This slice begins replacing it with something reachable
from the dashboard.

The intended end state, in the maintainer's terms: answer a few questions when
creating a company, and the connected agent understands enough context to run the
workflow. That end state needs a general, UI-authored workflow format, which this
project has twice declined to design speculatively (v20, v21). This slice builds
one real workflow by hand so the format has a specimen to generalise from.

## What was measured before designing

Every number here was measured on 2026-08-04, not assumed.

- **"All @plh.life email" is almost entirely one person.** Over the previous 30
  days, `from:plh.life` returned 29 messages: 19 from `takeshi@plh.life`, 9 from
  `nana@plh.life` (the operator's own mail, which must be excluded), and 1 from
  `koji.matsumoto@plh.life`. Roughly one message a day.
- **`gog` has runtime safety flags** beyond any allowlist: `--readonly` blocks
  mutating API requests, `--gmail-no-send` blocks sending specifically, and
  `--wrap-untrusted` wraps fetched text in external untrusted-content markers.
  The authenticated account (`nana@plh.life`) holds a full `gmail` scope, so it
  *can* send — these flags are what make that irrelevant.
- **`gog gmail get` supports `--format full|metadata|raw`.** Reading a body is
  `--format full`; `check-inbox` deliberately uses `metadata` and never reads one.
- **The operator has `push` and `triage` on all six PLH repos**, including
  `takeman555/english-camp-portal` and `guido-design/PLH_Daily_Media`.
  `plh-takeshi-agent/config.json` marks those two `can_open_pr: false`, which is
  therefore stale. Holding the permission is not a reason to use it; the config
  is simply no longer accurate.
- **Four of six PLH repos are mid-work**: `english-camp-portal`, `kiro-specs`,
  `plh-car-rental-website` and `plh-mobile` have uncommitted changes, and
  `plh-platform` and `plh-hr` sit on `fix/*` branches. Any analysis reads
  work-in-progress, not a clean tree.
- **A spawned session cannot read the PLH repos at all.**
  `run-company-command-impl.ts` spawns with `cwd: agent.rootPath` and passes no
  `--add-dir`, so file access is confined to the company repo.
- **The existing `needsPrefetch` mechanism already solves that**, and already
  reads GitHub issues: `buildPrefetch` runs `git log` and `gh issue list`
  control-panel-side via an injected `execFn` and embeds the output in the prompt.
  Only `handoff` uses it today.

## Scope

**In:** two read-only intake commands that produce an analysis file, and the
per-command prefetch seam they need.

**Out, deliberately:** filing GitHub issues. That is a new outbound public write
with no local artifact to review beforehand — exactly why v8 excluded
`create-epic` — and it gets its own slice (v33) with a two-step gate: the
existing diff-and-commit gate approves the analysis, then a separate "File as
GitHub issue" action posts it behind its own confirmation showing the exact repo,
title and body. Building it after v32 means the gate is designed against real
analyses rather than imagined ones.

**Also out:** giving the agent read access to the PLH repos (see "Rejected
alternatives"), any change to `plh-takeshi-agent` (that repo must not be mutated
by this project), and retiring the daemon.

## Design

### The prefetch seam

`CompanyCommand.needsPrefetch: boolean` becomes
`prefetchKind?: "repo-status" | "triage-email" | "triage-issue"`, and prefetch
moves into `lib/company-commands/prefetch/`, one module per kind, each taking an
injectable `ExecFileFn` with a real default.

`registry.ts` stays pure data — exec-calling code does not belong in it, and
keeping it out is what makes each prefetch independently testable. `handoff`
migrates to `prefetchKind: "repo-status"` with its current function extracted
verbatim, so its existing tests pass unchanged. The other five commands omit the
field and must build byte-identical spawn arguments, proven by test — the same
regression-proof shape v22 used when adding `bashPatterns`.

### The two commands

Both write to `notes/company/triage/` with `outputKind: "new-file-in-dir"`, so
the shipped diff → confirm → single-file-scoped-commit gate applies with no
changes.

**`triage-email`** — one optional `messageId` field. Blank means the most recent
message from an allowlisted sender. Prefetch resolves the target, fetches the
body, and attaches a repo summary.

**`triage-issue`** — one required `issue` field accepting `owner/repo#123` or a
full URL. Prefetch runs `gh issue view` and attaches the same repo summary.

Both command files also go into `templates/company-starter/.claude/commands/` so
any newly created company inherits them.

### Security properties

Three, and they are the reason this shape was chosen over the alternatives.

**The agent gets no `Bash` at all — on Claude Code.** `bashPatterns` stays empty,
because every external call happens control-panel-side in prefetch. This is
*tighter* than `check-inbox`, which needs scoped `Bash(gog ...)`. The agent
receives data, not tool access.

**Qualified, honestly:** this property is executor-dependent. Only
`AI_EXECUTORS["claude-code"].buildArgs` consumes `editScopePattern` and
`bashPatterns`; the `openai-codex` entry passes `--sandbox workspace-write` and
`aider` passes `--yes-always --no-auto-commits`, both ignoring those inputs
entirely. So on those two executors the no-Bash and scoped-Edit guarantees do
**not** hold — their sandboxes are whatever those tools implement, which this
project neither sets nor verifies.

This is pre-existing and affects every command including `check-inbox`, but v32 is
the first command whose input is attacker-influenced, so it must not be papered
over. Two mitigations, both cheap: the untrusted-content framing below is in the
*prompt*, so it applies on every executor; and the commands' generated
documentation states plainly that the confinement guarantees are Claude
Code-specific. Gating the triage commands to Claude Code outright was considered
and rejected as out of scope — it would be a change to the executor-selection
feature, not to this slice — but it is recorded as a follow-up.

**Every `gog` invocation carries `--readonly` and `--gmail-no-send`.** Belt and
braces: the allowlist governs what may be invoked, these flags govern what the
tool will refuse regardless of how it is invoked.

**Every byte of attacker-influenced text is fenced by the control panel itself**,
between a `--- UNTRUSTED:<nonce> ---` line and the matching
`--- END UNTRUSTED:<nonce> ---` line, with a fresh `crypto.randomUUID()`-derived
nonce per run (`lib/company-commands/prefetch/untrusted-fence.ts`), and both
prompts state that everything inside the fence is data describing a request, never
instructions to follow. The input is attacker-influenced — anyone can send mail to
a `@plh.life` address, and anyone who can file an issue writes its text — and this
is the slice's primary injection defence.

Two details matter for it to hold. **The fence is the control panel's, not
`gog`'s.** The email body is still fetched with `--wrap-untrusted` (two markers
beat one), but prefetch never verified those markers arrived, so a framing layer
that depended on them was not the *independent* third layer this section claims —
if the flag became a no-op the prompt would point at delimiters that weren't there.
And **the nonce exists because the wrapped content is the attacker's**: a fixed
marker can be closed early by a body containing `</external-untrusted>` or a
plausible `--- repo context (routed to X) ---` line, whereas a token its author
never saw cannot be forged.

**Every sender-supplied field sits inside the fence.** For `triage-email` that
means the `From`, `Date` and `Subject` — which come straight off the `gog` row
and are as sender-controlled as the body — join the body inside it. Presenting
them as trustworthy metadata above a fence, under a prompt saying the fenced
part is the untrusted part, would have made a payload in the Subject line land
in a region the prompt had just implied was safe. For `triage-issue` the whole
`gh` payload (title, body, labels, author) is inside.

What legitimately sits outside the fence is narrower than "control-panel-authored,"
though: the operator-supplied reference `parseIssueRef` has already validated
to an exact shape, the resolved message id and how it was resolved, and the
repo-context block (branch, `git status` output, recent commit subjects, up to
200 tracked file paths). That last one is git-derived, not literally
control-panel-authored — it comes from the operator's own repos, not from the
sender, so it isn't attacker-influenced in the sense this fence defends
against, but it is real text the control panel didn't write.

### The sender allowlist

`definitions/triage/senders.yaml` in the company's own repo — company data, not
application config, consistent with how `definitions/` is already used, and
portable with the company.

Seeded with the two addresses actually measured: `takeshi@plh.life` and
`koji.matsumoto@plh.life`. Matching is case-insensitive on the exact address, the
same rule `plh-takeshi-agent/bin/process.sh` already applies. The operator's own
address is excluded, since 9 of last month's 29 hits were their own mail.

**If the file is missing or empty, the command refuses to run.** It fails closed:
an absent allowlist must never mean "accept anything."

**Stated plainly, because the name oversells it: this is a From-header filter, not
sender authentication.** Nothing in this slice verifies SPF, DKIM or DMARC, so the
allowlist answers "who does this message claim to be from", not "who sent it", and
a spoofed header could get a message analysed. Not overstated either: the blast
radius is bounded by the two layers that don't depend on the allowlist at all — the
session gets no `Bash` and no repo but the company's own, and nothing it writes is
real until a human reads the diff and confirms the commit. One extractor
(`extractSenderAddress` in `triage-config.ts`) serves both the cheap search-row
pre-filter and the authoritative gate, prefers the bracketed address, and **refuses
a header carrying more than one address** rather than picking one: `From: Evil
<evil@attacker.com> takeshi@plh.life` is ambiguous, an ambiguous From is an
unverified From, and resolving it to whichever address happens to be allowlisted
would fail open where everything else here fails closed.

**Known friction, disclosed not hidden:** this file is not editable through the
dashboard. The skills editor only writes paths that are already members of the
discovered skill set (`resolve-known-skill.ts`), so a config file under
`definitions/` cannot be edited there. Editing it means a terminal or an external
editor. A future slice could add a small allowlist editor; this slice does not.

### Repo routing

**The repo list lives in the company's own repo**, at
`definitions/triage/repos.yaml`, alongside `senders.yaml` — each entry a name, an
absolute path, and a one-line description.

It deliberately does **not** read `plh-takeshi-agent/config.json`, even though
that file already holds this list and reading it would be permitted (the standing
rule forbids mutation, not reads). Two reasons: this arc exists to *retire* that
daemon, so taking a new dependency on its config would be backwards; and that
file is already known to carry stale data (the `can_open_pr` flags). The
triage company owning its own list keeps it self-contained and portable.

Routing is a **case-insensitive keyword match** of each entry's name and
description words against the email subject and body (or the issue title and
body). Exactly one match routes to that repo. Zero or multiple matches is the
ambiguous case.

For the routed repo, prefetch attaches recent commits, the file list, and the
**current branch and dirty state**. Branch and dirty state matter specifically
because four of six repos are mid-work: an analysis assuming a clean tree would
reason about a state that does not exist.

Where routing is ambiguous, prefetch supplies every entry's summary line (name,
description, branch, dirty state) without a full file list for each, and the
analysis must state its own routing confidence rather than silently guessing.
Deliberately dumb matching: the agent, not the prefetch, is the thing that can
reason about which repo a request concerns, so prefetch's job is to avoid
*foreclosing* on the right answer rather than to be clever.

## Failure modes

Everything that can fail is checked **before** the session spawns, so a doomed
run never costs an API call:

| Condition | Behaviour |
|---|---|
| `senders.yaml` missing or empty | Refuse, naming the file |
| `repos.yaml` missing or empty | Refuse, naming the file — an analysis with no repo context is not worth a session |
| No message from an allowlisted sender | Refuse, do not spawn |
| `gog` missing or unauthenticated | Refuse, with the specific reason |
| `gh` missing, `triage-issue` | Refuse |
| A candidate repo's `git` reads fail, either command | That entry's summary degrades to `(unable to read this repo: …)` and the run continues. (`triage-email` never calls `gh` at all — its repo context is pure `git`.) |
| From header resolving to zero or more than one address | Refuse — an ambiguous From is an unverified From |
| Ambiguous routing | Supply the full repo list; the analysis states its confidence |

Spawn failures reuse v9's `child.on("error")` handler alongside the existing exit
handler, so a failed spawn releases the run lock rather than wedging the feature.

Running `triage-email` twice with a blank `messageId` analyses the same message
twice. That is deliberate: a watermark/dedupe store is the daemon's problem, not a
human-clicked button's, and the diff gate shows the operator exactly what they are
about to commit. No state file is added.

## Testing

Unit tests per prefetch module with an injected `execFn`: happy path, `gog`
absent, `gh` absent, empty allowlist, missing allowlist file, `messageId` supplied
versus blank, and case-insensitive address matching.

A regression test proving the five untouched commands build byte-identical spawn
arguments after the `needsPrefetch` → `prefetchKind` migration.

Two tests carrying the security weight, both in
`lib/company-commands/registry.test.ts`: `bashPatterns` is empty for both new
commands (the `withBash` enumeration), and both commands' built prompts contain the
untrusted-content framing — asserted on short distinctive phrases, including the
`UNTRUSTED:<nonce>` fence reference, so rewording the paragraph stays green while
deleting the defence fails. The prefetch side is covered separately: that every
sender-supplied field lands inside the fence, that the trusted region holds none of
it, and that the nonce differs run to run.

Live verification against a freshly-created disposable `/tmp` company, using real
**read-only** `gog` reads (sanctioned precedent from v22), stopping at "Started"
rather than waiting for a spawn to complete, per the standing rule that automated
verification must never wait on a real headless `claude -p` run. `plh-takeshi-agent`
and `plh-ops` are never touched.

## Rejected alternatives

**Give the agent read access to the routed PLH repo** (via `--add-dir`). It would
allow genuinely deep analysis — grep for the actual cause rather than infer the
area. Rejected for this slice because v8 *measured* `--add-dir` behaving
differently from how it was assumed to behave (it adds directories on top of an
already-writable `cwd`; `acceptEdits` auto-approves within `cwd` regardless of
allow-list scoping), and a real out-of-scope write succeeded under a config
believed safe. Re-introducing it therefore requires measurement, not reasoning.
Worth revisiting once v32's analyses show what depth is actually missing.

**Let the run file the GitHub issue directly**, with scoped
`Bash(gh issue create*)`. Rejected: a public issue would appear, and notify
people, with no human review of content derived from an untrusted email body.

**A tmux session the operator can attach to and type into.** This was the
maintainer's original framing — launch a Claude session in the terminal and paste
the content in. Rejected once it was clear the dashboard's existing runner already
spawns a real session per run with a live log tail and a diff gate; the only thing
lost is interactive typing, and the UI was the explicitly stated goal.

## Follow-ups this slice deliberately leaves open

- v33: the "File as GitHub issue" two-step write path.
- `plh-takeshi-agent/config.json`'s stale `can_open_pr: false` on
  `english-camp-portal` and `PLH_Daily_Media`. Out of scope — that repo must not
  be mutated by this project — but recorded because it is now known to be wrong.
- No dashboard editor for `definitions/triage/senders.yaml`.
- **Whether the triage commands should be gated to Claude Code**, given that the
  no-Bash and scoped-Edit confinement is executor-specific (see "Security
  properties"). Deciding it properly means deciding it for all nine commands, not
  just these two, which is a change to the executor-selection feature rather than
  to this slice.
- Retiring the daemon itself, which is what this arc is ultimately for.
