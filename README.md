<div align="center">

<img src="landing/logo.png" alt="Alacrán" width="110" />

# Alacrán

**Give your AI a memory of your business — on your own machine.**

[![CI](https://github.com/kwakuoseikwakye/alacran/actions/workflows/ci.yml/badge.svg)](https://github.com/kwakuoseikwakye/alacran/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-ff2e43.svg)](LICENSE)
[![Download](https://img.shields.io/github/v/release/kwakuoseikwakye/alacran-releases?label=download)](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest)

[Download](#install) · [Quick start](#quick-start) · [How it works](#how-it-works) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

</div>

---

Every AI chat starts as a stranger. It doesn't know what you sell, who your
customers are, or how you like things written, so you re-type the same
background paragraph before it can be any use.

Alacrán is a small local app that fixes that. You describe your business once,
in plain language. It writes that down as structured files in a folder **you**
own, hands them to your coding-agent CLI before every task, and shows you a
diff of anything the agent wants to write — before it's saved.

It is not a hosted service. There is no account, no licence key, and no server
of ours your data could reach. It runs as a local Next.js server on
`127.0.0.1` and opens in your browser.

## What it actually does

- **Create a company** — one folder holding everything an AI should know about
  a business, scaffolded from one of 7 starter packs (General, Software
  engineering, Sales, Marketing, Customer support, HR & People, Leadership).
- **Guided setup** — a plain-language wizard (business domain, stakeholders,
  value flow, bottleneck) that writes a structured ontology file. Or let the
  AI draft the domain entities for you.
- **Run jobs** — `digest`, `decision`, `retro`, `handoff`, `define-company`,
  `check-inbox`, `triage-email`, `triage-issue`. Each spawns a headless agent
  session scoped to exactly one output directory, then shows you the diff
  before anything is committed.
- **Edit and version skills** — browse every skill and slash-command across
  your companies, edit them in-app, and get real git history, per-commit
  diffs, and one-click revert. Every write is a single-file-scoped git commit
  in that company's own repo.
- **Connect tools** — detect-and-guide setup for the Claude Code CLI, Google
  (Gmail/Calendar via `gog`), and GitHub. Alacrán never holds a credential
  itself; it checks whether *your* CLI is already authenticated.
- **Bring your own agent** — Claude Code by default, with OpenAI Codex and
  Aider selectable per company.

## Install

### Download a build

| Platform | File | |
|---|---|---|
| macOS (Apple Silicon / Intel) | `Alacran.dmg` | [Download](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran.dmg) |
| Debian / Ubuntu | `Alacran.deb` | [Download](https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran.deb) |

**macOS.** Open the `.dmg` and drag Alacrán to Applications. Then — before the
first launch — run this once in Terminal:

```bash
xattr -cr "/Applications/Alacrán.app"
```

The build is ad-hoc signed but **not notarized**, because that requires a paid
Apple Developer account. Without the command above, macOS quarantines the
download and refuses to open it — often with *"Alacrán is damaged and can't be
opened"*, which is misleading: the app is fine, it just isn't signed by a
registered developer. `xattr -cr` clears the quarantine flag macOS attaches to
anything downloaded from the internet. Right-click → **Open** alone is **not**
enough for an ad-hoc-signed app on current macOS.

You only do this once, per install. Repeat it after each update.

*A signed and notarized pipeline is welcome as a contribution — it needs the
certificate, not the code. See the [issue tracker](https://github.com/kwakuoseikwakye/alacran/issues).*

**Linux.**

```bash
sudo apt install ./Alacran.deb
# or: sudo dpkg -i Alacran.deb && sudo apt -f install
```

Then launch Alacrán from your applications menu.

Both builds bundle a standalone Next.js server. They start it locally and open
your default browser at `http://127.0.0.1:<port>`.

### Or build from source

See [Development](#development) below.

## Updating

Alacrán checks for a new release once a day and shows a banner when one's
available.

- **Linux**: click **Update & Restart** in the banner. It downloads the new
  `.deb`, installs it via a native `pkexec` password prompt (the same kind of
  prompt GNOME Software uses), and restarts the app for you. If `pkexec`
  isn't installed, it shows the exact `sudo apt install` command instead.
- **macOS**: click **Download it** and repeat the install steps above
  (including `xattr -cr`). There's no one-click updater here yet — these
  builds aren't notarized, so a silently-installed update would just get
  Gatekeeper-blocked on next launch, which is worse than asking you to
  download it yourself.

Set `ALACRAN_NO_UPDATE_CHECK=1` to turn the check off entirely.

## Uninstalling

- **Linux**: `sudo apt remove alacran` keeps your data;
  `sudo apt purge alacran` also removes Alacrán's own registry/settings at
  `~/.local/share/Alacrán`. Either way, your companies' actual files —
  wherever you put them, e.g. `~/AI-Native/` — are untouched.
- **macOS**: run `bash scripts/uninstall-macos.sh` from a checkout, or by
  hand: drag `/Applications/Alacrán.app` to the Trash, and delete
  `~/Library/Application Support/Alacrán` if you want its registry gone too.

## Prerequisites

Alacrán drives command-line tools you install and authenticate yourself. It
never stores an API key and never proxies a request to a model provider.

**Required**

- **[Node.js](https://nodejs.org/) 20 or newer** — the packaged app runs a
  Node server and needs `node` on your `PATH`. Check with `node -v`.
- **Git** — every company is a git repository; all writes go through real
  commits. Check with `git --version`.
- **A coding-agent CLI**, at least one of:

  | Agent | Install | Notes |
  |---|---|---|
  | Claude Code *(default)* | `npm install -g @anthropic-ai/claude-code` | The only one with fine-grained `Edit(path)` / `Bash(cmd)` permission scoping. Recommended. |
  | OpenAI Codex | `npm install -g @openai/codex` | Coarser permissions (`--sandbox workspace-write`). |
  | Aider | `uvx --from aider-chat aider` | Can point at a local model via Ollama. |

  You authenticate these yourself, with your own account. Alacrán checks
  whether the binary exists and tells you if it doesn't — it never installs
  anything for you.

**Optional**

- **[`gog`](https://github.com/gogcli/gog)** (`brew install gogcli/tap/gog`) —
  a Google API CLI, needed only for the `check-inbox` command (read-only Gmail
  summaries). Alacrán detects it and guides you if it's missing.
- **[GitHub CLI](https://cli.github.com/) (`gh`)** — needed only for the
  optional "back up this company to a private repo" flow.

**Not required:** an Alacrán account, a licence key, a network connection for
anything except the AI calls themselves and a once-a-day version check you can
turn off.

## Quick start

1. **Open Alacrán.** A fresh install starts empty and shows an onboarding
   screen with a dependency checklist.
2. **Add a company.** Type a path that doesn't exist yet and Alacrán offers to
   scaffold it from a starter pack; type a path to an existing directory (with
   `.git` and `.claude`) and it just registers it.
3. **Answer four questions.** The setup wizard asks what the business does, who
   it serves, how value flows, and what's eating your time — then writes
   `definitions/ontology/company.yaml`. Or click **Let AI draft tailored
   entities** and review what it proposes.
4. **Run a job.** Open **Skills**, pick a command, hit **Run**. The agent runs
   headlessly, scoped to one output directory. When it finishes, you get a
   diff. Nothing is written to git until you approve it.

A longer, step-by-step walkthrough — including what to do when macOS blocks the
first launch — is in [`landing/how-to-use/`](landing/how-to-use/index.html),
which is also the source for the site's How-to-use page.

## How it works

```
┌─ Your machine ────────────────────────────────────────────────┐
│                                                               │
│   Browser  ──►  Alacrán (Next.js, 127.0.0.1)                  │
│                     │                                          │
│                     ├─► reads/writes  ~/your-company/          │
│                     │      definitions/  docs/  notes/         │
│                     │      .claude/skills/  .claude/commands/  │
│                     │                                          │
│                     └─► spawns  claude -p …  (headless)        │
│                                    │                           │
└────────────────────────────────────┼───────────────────────────┘
                                     ▼
                            your AI provider
```

A few design decisions worth knowing, because they constrain everything else:

- **Your data is plain files in your own git repos.** Alacrán stores only its
  own registry (`~/Library/Application Support/Alacrán` on macOS, `$XDG_DATA_HOME`
  on Linux). Delete the app and every company you made is still there,
  readable without it.
- **Every write is a single-file-scoped commit.** `git add -- <file> && git
  commit -- <file>`, never a bare `git commit` that could sweep up unrelated
  changes in your repo.
- **Two independent gates on every write path.** Containment
  (`lib/path-guard.ts`: the resolved real path must be inside a known company
  root) *and* membership (`lib/resolve-known-skill.ts`: it must correspond to
  an actual known skill file). Both, always, on both read and write.
- **Spawned agents are scoped, not trusted.** Each command's session gets
  `--allowedTools Read,Grep,Glob,Edit(<one directory>)` and, only where a
  command genuinely needs a CLI, narrowly-pattern-matched `Bash(...)` access.
  Blanket `Write` and `--permission-mode acceptEdits` are deliberately not
  used — see [v8 in the changelog](CHANGELOG.md) for the live test that proved
  why.
- **The app detects what changed; the agent never commits.** Alacrán diffs the
  result itself and shows it to you. Approval is a human step by construction.

For the reasoning behind each of these, [`CHANGELOG.md`](CHANGELOG.md) has a
detailed, dated writeup of every feature that shipped — including the ones
that were investigated and deliberately *not* built, and the security bugs
found during live testing — and `CLAUDE.md` carries the standing conventions
and a running summary of the current state.

## Development

```bash
git clone https://github.com/kwakuoseikwakye/alacran.git
cd alacran
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with Fast Refresh |
| `npm test` | Full vitest suite (no network, no real subprocesses) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type check |
| `npm run build` | Production build |
| `bash scripts/package-macos.sh` | Build `dist/Alacrán.app` + `.dmg` (macOS only) |
| `bash scripts/package-linux.sh` | Build `Alacran.deb` (Debian/Ubuntu) |

**Tech:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Radix primitives · vitest.

**Testing philosophy.** Every function that shells out or touches the
filesystem takes an injectable `ExecFn`/`SpawnFn` with a real default, so the
suite never spawns a real process, never hits the network, and never reads the
real clock. If you add a new one, follow the pattern — a test that needs the
real world is a test that will be flaky for everyone else.

**Layout:**

```
app/          Next.js routes (/, /activity, /skills, /connect)
components/   React components; components/ui/* are shadcn-style primitives
lib/          All logic. *-impl.ts holds the injectable seam, the sibling
              file is the thin "use server" Server Action wrapper.
templates/    The company starter template + 7 starter packs (plain files)
scripts/      Packaging and asset-generation scripts
landing/      The static marketing site (plain HTML/CSS, no build step)
docs/         Design specs and implementation plans, one per slice
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR — in particular the
conventions around `components/ui/*` (don't edit them) and design tokens.

## Privacy

There is no analytics, no telemetry and no crash reporting in this app. Not
disabled by default — not present. The complete list of what leaves your
machine:

1. **Your prompts**, to whichever AI a company is pointed at, when you press
   Run. That's the agent CLI doing its job.
2. **A version number check** against the public releases page, at most once a
   day, so the app can tell you an update exists. Anonymous read of a public
   URL; dismissible.
3. **Your files to your own private GitHub repo**, only if you press Back up.

That's it. The source is right here — verify it rather than trusting it.

## Status and honest caveats

Alacrán is genuinely used daily by its author, but it is a young project
maintained by one person. Known rough edges, stated plainly:

- **macOS builds aren't notarized.** You must run `xattr -cr` on the installed
  app before the first launch, and again after each update. See
  [Install](#install).
- **Windows isn't built.** Only macOS and Debian/Ubuntu.
- **`gog` and `daily-team-log` are per-machine global.** Only one company can
  have an active Google account or bootstrapped daily-log config at a time.
- **OpenAI Codex and Aider are wired but not run end-to-end** against a live
  account from this app. The flags are verified against each CLI's real
  `--help`; the full round trip isn't. Claude Code is the well-tested path.
- **No support SLA.** Issues and PRs are read and welcome. If you need it to
  work a particular way, the licence lets you make it so.

## Contributing

Bug reports, feature requests and pull requests are welcome. Start with
[CONTRIBUTING.md](CONTRIBUTING.md); security issues go to
[SECURITY.md](SECURITY.md) instead of the public tracker.

## License

[MIT](LICENSE) © Kwaku Osei Kwakye

Brand icons are official [Simple Icons](https://simpleicons.org/) (CC0),
extracted by `scripts/generate-brand-icons.mjs` — never hand-drawn.
