# Terminal-visible company-command runs, with a pre-run gate

**Date:** 2026-08-06
**Status:** approved, not yet implemented

## Problem

Every company command (`define-company`, `digest`, `decision`, `retro`, `handoff`,
`check-inbox`, `triage-email`, `triage-issue`) runs headless today:
`runCompanyCommandImpl` spawns `executor.binaryName` detached, with stdio
redirected to a log file the app polls and tails in its own UI. A technical
user who wants to *watch* a run happen — and, before anything runs, actually
see the exact prompt and either approve or abort it — has no way to do that.
This surfaced while defining a company: "I want to tell my agent this
company reads emails and performs tasks, but before performing the tasks I
want it to open a terminal session."

That framing blends two different things worth separating up front, because
only one of them is a mechanism this app can deliver:

- **Describing** the company ("reads emails, performs tasks") is text that
  belongs in `definitions/ontology/company.yaml` — an agent may read it as
  context, but no code anywhere acts on it.
- **Causing** a terminal to open before a task runs is something only the
  *app* can do, by choosing how it spawns the process. The spawned agent
  itself has no shell access to open a terminal with — `triage-email` and
  `triage-issue` are deliberately given no Bash at all, which is the whole
  point of v32's design. An instruction telling the agent to "open a
  terminal first" would be a wish the system has no way to honor.

This slice builds the second thing: an app-level choice, made when defining
a company (and editable afterward), that changes *how the app spawns every
command for that company* — into a visible terminal with a human gate
before the run starts, rather than a headless background process.

## Scope

**In:** a per-company setting, set during the company-setup wizard and
editable on the company card afterward, that makes every command for that
company run in a visible macOS Terminal window instead of headless. The
window shows the exact prompt before anything happens and waits for the
user to press Enter (or abort). After the run, it offers to drop into an
interactive `claude -c` session continuing that exact conversation.

**Out, deliberately:**
- Non-macOS support. The setting simply doesn't appear on non-darwin — see
  "Rejected alternatives."
- Any change to what a command is allowed to do. The prompt, the tool
  allowlist (`--allowedTools`/`--disallowedTools`/`bashPatterns`), and the
  diff-then-commit gate are byte-identical to a headless run. This slice
  only changes where the process's stdio goes and whether a human sees a
  gate before it starts.
- The interactive take-over step's own tool scoping. Once a user takes
  over, they're in a normal Claude Code session bound by their own
  settings, not the command's — see "Honest limits."
- Broadening any command's permissions. That thread is a separate,
  unrelated investigation — see "Related investigation, not in scope"
  below.

## Design

### The setting

A new per-company boolean, stored the same way the existing AI-executor
assignment already is: `lib/visible-run-registry.ts`, mirroring
`lib/ai-executor-registry.ts`'s shape exactly (JSON array of
`{ agentId, runVisibly }` assignments in `.data/visible-runs.json`,
validated against `getEffectiveAgents()`, injectable `registryPath`).

**Where it's set:** a step in `components/company-setup-wizard.tsx`, since
the user is configuring this while defining the company — not a checkbox
discovered later on the card. It's still editable afterward via the
existing "Edit company details" entry point, same as every other
wizard-collected setting.

**Where it is *not* stored:** `definitions/ontology/company.yaml`. That
file is the company's portable, plain-data business definition (v17's
design principle — `.claude/*` and app-level execution choices are
adapters on top of it, not part of it). An "open a terminal" preference is
an app execution choice, not a fact about the business, so it stays in the
app's own registry.

**Platform gating:** `process.platform === "darwin"` is checked
server-side in `app/page.tsx` (or wherever the wizard step is rendered)
and passed down. On non-darwin the wizard step and the card's edit control
are both simply absent. A stored `runVisibly: true` value is still honored
if it somehow exists (e.g. a company registry copied from a Mac), but
`runCompanyCommandImpl` falls back to headless on non-darwin rather than
failing.

### The spawn

`runCompanyCommandImpl` gains one branch at the spawn point. Everything
before it — field validation, prefetch, the before-snapshot, `buildPrompt`,
`executor.buildArgs` — is unchanged, so a visible run and a headless run
build the exact same prompt and the exact same tool allowlist. Only what
happens with the built `spawnArgs` differs.

**Headless (today, unchanged):**
```ts
const child = spawnFn(executor.binaryName, spawnArgs, {
  cwd: agent.rootPath, detached: true, stdio: ["ignore", outFd, outFd],
})
child.on("exit", () => releaseRunLock(dataDir).catch(() => {}))
child.unref()
```

**Visible (new):** the args array and the prompt are never interpolated
into shell text — both go into files, read into a bash array with
NUL-delimited `mapfile`, specifically because `triage-email`'s prompt
contains attacker-influenced email content that v32 built a whole fencing
mechanism around. String-interpolating that into a generated script would
reopen exactly the injection surface v32 closed.

1. Write `spawnArgs` to `${dataDir}/${command.id}.args`, NUL-delimited.
2. Write the prompt text to `${dataDir}/${command.id}.prompt` (same content
   already embedded in `spawnArgs`, duplicated here only so the gate can
   `cat` it before the run, without parsing the args file).
3. Generate a wrapper script at `${dataDir}/${command.id}.run.sh`:

```bash
#!/bin/bash
trap 'rm -f "<lockPath>"' EXIT        # fires on run, abort, or window close —
                                        # a leaked lock wedges the company
cd '<agent.rootPath>'
mapfile -d '' ARGS < '<argsFile>'

echo "About to run: <binaryName> (in <agent.rootPath>)"
echo "--- prompt ---"
cat -v '<promptFile>'                 # -v renders control chars visibly —
                                        # see "Why cat -v, not echo" below
echo "--- end prompt ---"
read -p "Press Enter to run, or Ctrl-C to abort: "

"<binaryName>" "${ARGS[@]}" 2>&1 | tee -a '<logPath>'
rm -f "<lockPath>"
echo "Finished — review and commit the diff in Alacrán."
read -p "Press Enter for an interactive session, or close this window: "
exec "<binaryName>" -c
```

4. `spawnFn("open", ["-a", "Terminal", scriptPath], { cwd: agent.rootPath, detached: true, stdio: [...] })`.
   In visible mode, Node does **not** attach a `child.on("exit")` handler —
   `open` returns the moment it's told Terminal to open the window, long
   before the script (let alone the run inside it) finishes. Attaching the
   existing exit handler would release the lock immediately and the app
   would report "finished" while the gate is still waiting for Enter.

Three properties this preserves on purpose:

- **The lock's lifetime is owned by the script (`trap ... EXIT`), not by
  Node.** This is the actual crux of the whole design — everything else
  follows from `open` returning instantly.
- **`tee -a` writes into the exact log path the app already polls.** The
  in-app log view, `pollUntilDone()`, the result reader, and the
  diff-then-commit gate all keep working with zero changes — they don't
  know or care whether the process producing that log is headless or in a
  visible window.
- **Nothing sender- or user-supplied is ever shell-interpolated.** The
  prompt and args exist only as file content read by `mapfile`/`cat`.

**Why `cat -v`, not `echo "$PROMPT"` or a plain `cat`:** the gate's entire
value is that the user can trust what they're reading before approving a
run. `triage-email`'s prompt contains attacker-influenced email body text
(inside v32's `UNTRUSTED:<nonce>` fence, but still rendered to a terminal).
Raw ANSI escape sequences in that text could rewrite or hide terminal
lines, letting a crafted email body *look* harmless in the gate while the
actual prompt says something else — defeating the one property the gate
exists to provide. `cat -v` prints control characters as visible
sequences (e.g. `^[`) instead of letting the terminal execute them.

### Take-over

`-c` continues the most recent conversation — confirmed via `claude
--help` (`-c, --continue — Continue the most recent conversation in this
directory`). Since the wrapper already ran `claude -p` in
`agent.rootPath`, `claude -c` in that same directory picks up that exact
conversation rather than starting cold, which is what makes take-over
actually useful rather than just "also open a blank session here."

### Small, related fix while touching this code

`lib/ai-executors.ts` passes `--permission-mode default`. `default` is
accepted (verified: a bogus value errors, `default` doesn't) but is not
among the documented choices (`acceptEdits`, `auto`, `bypassPermissions`,
`manual`, `dontAsk`, `plan`) — it's a legacy alias for `manual`, per
`claude --help`'s permission-modes text confirmed in this session's
investigation. Not broken today, but fragile: a future Claude Code release
could drop the alias, and every command would fail at spawn with no
warning until someone runs one. Pin it to `"manual"` while this file is
open for other reasons. One-line change, own commit, unrelated enough to
this slice's actual feature that it shouldn't be buried in the same diff.

## Honest limits

**Take-over is not scoped by the command's allowlist.** The interactive
`claude -c` session is a normal Claude Code session, bound by the user's
own settings (`~/.claude/settings.json` + this repo's project settings,
if trusted — see the investigation below), not by
`--allowedTools`/`--disallowedTools`/`bashPatterns`. It can edit anything
in the repo and run any tool the user's own configuration permits. The app
has no visibility into it once started. This is disclosed in three places:
the wizard's setting description, the script's own printed output before
offering take-over, and here.

**A taken-over run is invisible to the app's accounting.** The lock is
already released (the constrained run finished) before take-over is
offered, so the app may let another command start for the same company
while the user is still in that interactive session. Documented, not
prevented — preventing it would mean holding the lock for an unbounded
interactive session, which has its own problems (a forgotten open terminal
would wedge the company indefinitely).

**This is opt-in and per-company, not a default.** It doesn't change
anything about how any company behaves unless the user explicitly turns it
on for that company in the wizard.

## Failure modes

| Condition | Behavior |
|---|---|
| Non-darwin platform | Setting not shown; a stored `true` value is ignored, run goes headless |
| `open -a Terminal` fails to launch | Caught by the existing try/catch, lock released, `{started:false, message}` — same shape as any other spawn failure today |
| Script/args/prompt file write fails | Caught by the existing try/catch, lock released |
| User closes the window before pressing Enter | `trap ... EXIT` releases the lock; no run happened; the app's existing "not running" state is accurate |
| User closes the window mid-run (`claude` still executing) | The piped `claude` process dies with the window/shell; `trap` still fires and releases the lock. **Not independently verified this session** — flagged for verification during implementation, not assumed |
| User takes over, then closes that window too | No further app-visible effect; the take-over session was already outside app accounting |

## Testing

- The script-generation function is pure (inputs: binary name, args-file
  path, prompt-file path, log path, lock path, cwd → output: script text),
  so it's directly unit-testable: assert the `trap ... EXIT` line, the
  `cat -v` (not `cat` or `echo`) on the prompt file, the `tee -a` target
  matching the real log path, the `mapfile -d ''` args read, and —
  explicitly, as a regression guard — that no prompt text or field value
  ever appears literally in the generated script, only file *paths*.
- `runCompanyCommandImpl`'s branch is testable through the existing
  injected `SpawnFn`: assert that visible mode invokes `open` with `-a
  Terminal` and the script path, and that no `exit` listener is attached
  in that branch (vs. headless, where one is).
- Live verification: a disposable `/tmp` company (sanctioned target #2),
  visible mode on, confirming the Terminal window actually opens and shows
  the gate — stopping there. Per the standing rule, automated verification
  must never wait on a real `claude -p` completion; this applies doubly
  here since a human is meant to be the one pressing Enter.

## Rejected alternatives

**Cross-platform terminal support (Linux via
`x-terminal-emulator`/`gnome-terminal`/`konsole`/`xterm` detection).**
Rejected for this slice: no single reliable mechanism, more failure modes,
and no way to test any of it on the machines available for this project.
macOS-only with silent absence elsewhere is honest about that limit rather
than papering over it with an untested fallback chain.

**Always-interactive, no gate (v32's originally-rejected "tmux you can
type into").** Different from what's built here in one specific way: v32
rejected letting the *agent itself* be interactive for every run,
replacing the UI-driven flow. This design keeps every run constrained and
UI-accounted exactly as before; visibility and the pre-run gate are the
only additions, and interactivity is offered only *after* the constrained
run completes, as an explicit extra step. The reasoning that made v32
reject full interactivity (loses UI accounting, loses the tool-scoping
guarantee) is exactly why take-over here is disclosed as a deliberate,
opt-in exception rather than the run mode itself.

**A pre-run gate implemented as an in-app confirmation dialog instead of a
terminal `read -p`.** Would keep everything in-process (no `open`, no
wrapper script, no lock-lifetime handoff). Rejected because it doesn't
satisfy the actual request — the point was to see it happen in a real
terminal, not to get an extra dialog before the same headless run.

## Related investigation, not in scope: permission inheritance

While scoping a follow-on request ("let the agent take over more on my
laptop"), this session measured how Alacrán's spawned runs interact with
the user's own Claude Code settings. Findings, for whoever picks this up
next — not designed, not planned, no code changes here:

- **Settings load regardless of `--allowedTools`.** Documented and
  confirmed: `~/.claude/settings.json` (user), `<cwd>/.claude/settings.json`
  (project), and `<cwd>/.claude/settings.local.json` (local) all load
  alongside the CLI's flags. `permissions.allow` rules merge **additively**
  across every loaded scope — specificity doesn't matter, any matching
  allow rule anywhere grants the action. Deny always wins regardless of
  scope or specificity.
- **This measurably weakens two shipped guarantees, both because they rest
  on allow-scoping rather than deny:**
  - `check-inbox` is the only shipped command with `bashPatterns`, so it
    skips the bare `--disallowedTools "Bash"` denial. Its real Bash
    surface is `Bash(gog ...)` **plus the union of every loaded settings
    file's Bash allow rules** — on the machine this was measured on, that
    includes `Bash(git push *)`, `Bash(gh pr *)`, `Bash(npm run *)`, and
    more. v22's spec describes it as strictly read-only; that claim
    depends on what's in the user's own settings, which v22 didn't
    account for.
  - Any command's `Edit(<declared output path>)` scoping is only as tight
    as the *union* of loaded settings files. A bare `Edit` or `Write`
    allow rule in any loaded scope defeats it. (Observed on this machine:
    `plh-ops/.claude/settings.local.json` has exactly that.)
  - **What still holds:** `triage-email` and `triage-issue` have no
    `bashPatterns`, so they get the bare-tool-name Bash removal, which
    (per the CLI's own documentation, and consistent with everything
    observed) cannot be widened by any settings scope. v32's central
    claim — no shell access at all for the two commands that take
    attacker-influenced input — survives this investigation.
- **Project-level settings are gated by workspace trust, and this was not
  documented anywhere reviewed — it was found empirically.** A live probe
  in a disposable `/tmp` company, with a deliberately permissive
  `.claude/settings.json`, produced: `Ignoring 4 permissions.allow entries
  from .claude/settings.json: this workspace has not been trusted.`
  Checking `~/.claude.json`'s `projects` map confirmed `ai-company-starter-main`
  and `control-panel` are both currently untrusted on this machine — so
  their project-level settings are being ignored in every Alacrán run
  against them today. Trusting a workspace (something a technical user
  doing exactly what prompted this investigation might plausibly do) would
  change that going forward, for that company, invisibly to the app.
- **Not measured, flagged rather than assumed:** whether user-level
  settings (which aren't workspace-scoped) are gated the same way project
  settings are. The probe designed to test this didn't complete — it hit
  the account's own usage limit mid-run. Documentation states user-level
  settings load unconditionally alongside project/local, but this
  project's own history (v8's `--add-dir`, v31's `launchctl` exit codes)
  is exactly why "documented" and "measured" are being called out as
  separate categories here rather than treated as equivalent.

A future slice building on this would need at minimum: a per-company trust
indicator, the actual (not assumed) effective Bash/Edit surface, and a
decision on whether `check-inbox`'s spec needs a correction or `--setting-sources`
needs to be added to close the gap — none of which this slice touches.
