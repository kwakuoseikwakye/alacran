# v20: install the daily-team-log workflow — design spec

Piece 4 of the roadmap toward a Fleece.ai-style onboarding UI (v17:
create a company; v18: guided company-context setup; v19: integrations
status).

## What "plugin install" actually means today

The roadmap named v20 "guided command/workflow discovery, possibly
formalizing a plugin concept." Investigating what's real before
designing anything:

- **Command/workflow discovery is already fully solved**, and has been
  since v11: `genericCommandSetSkillAdapter` already scans any
  registered company's `.claude/skills/` and `.claude/commands/` for the
  Skills page, and v17's manifest already copies those directories into
  every new company. There is nothing missing here.
- **"Formalize the plugin concept" as a general, reusable packaging
  format does not exist anywhere in this ecosystem to build on** —
  unlike v17 (reused `ai-company-starter-main`'s template),
  v18 (reused that same template's `docs/templates/ontology-starter.yaml`),
  and v19 (deferred to the existing `api-connect` skill).
  `plh-takeshi-agent`'s pipeline is deeply specific to Kirirom (its
  6-role `plh-dev-team` skill is literally "handle an email from Takeshi
  about the PLH product repos"). `plh-ops`'s `skill-installer` mechanism
  (install → setup → activate for dormant skills) is real and
  well-designed, but lives in `plh-ops`'s own workflow tooling, not in
  `ai-company-starter-main`'s template — a new company doesn't have it
  either. Designing a real plugin-packaging format from scratch would be
  a bigger effort than v17–v19 combined, for a population of examples
  that (per the confirmed decision below) is deliberately kept at one.

**Decision (confirmed with the user): don't design a general plugin
format.** Instead, hand-build a one-off installer for exactly one real,
already-portable workflow, the same scoped-down spirit as v17–v19.

## Why `daily-team-log`

Surveyed the actual candidates. `plh-ops`'s `daily-team-log` skill
(`plh-ops/workflow/daily-team-log/`) stood out because — unusually for
anything in this ecosystem — **it was already designed to be portable**,
not bolted onto one specific repo after the fact:

- It ships its own `config.example.json` (a blank template: `person:
  null, projects: [], output_repo: null`) and a self-bootstrapping
  `Setup.md` that auto-detects who's using it and which local Claude
  Code projects to include, then writes a per-machine config and
  registers a scheduled task — a genuine install → setup → activate
  flow, the same shape `plh-ops`'s own `skill-installer` skill formalizes
  for exactly this kind of "dormant until configured" workflow (that
  skill itself isn't part of `ai-company-starter-main`'s template, so a
  new company doesn't inherit it either — but its pattern confirms
  `daily-team-log`'s bootstrap design isn't a one-off).
- Its extractor, `gather.py` (353 lines), reads only the local machine's
  own Claude Code session history — no external API, no OAuth, nothing
  to connect. Grepped for any PLH/Takeshi-specific content: **zero
  matches**. It is genuinely generic.
- It's entirely local: git commit + push to a repo, nothing more.

**The one real gap found:** `Setup.md` and `SKILL.md`, as they exist
today, are not actually generic — `Setup.md`'s Step 0 explicitly clones
`takeman555/plh-ops` and writes into `reports/{Eito,Lucce,Nana}`;
`SKILL.md`'s output template hardcodes `business: PLH` and frames itself
as feeding "Takeshi's analysis agent." Copying these two files verbatim
into a new company would be actively wrong — it would point that
company's daily reports at PLH's shared ops repo instead of its own.
`gather.py` and `config.example.json` need no such adaptation.

## Design

A new "Install daily-team-log" action, shown on any `command-set`-kind
agent's card that doesn't already have it (`.claude/skills/daily-team-log/`
missing — same existence-check pattern as v18's `companyOntologyExists`).
On click:

1. Copy `gather.py` and `config.example.json` **verbatim** from
   `plh-ops`'s real, current files (`AGENTS.find(a => a.id ===
   "plh-ops").rootPath` + `workflow/daily-team-log/...`) into the
   target company's `.claude/skills/daily-team-log/` — the same
   read-from-the-real-source-at-install-time approach v17 uses for its
   manifest, not a stale embedded copy.
2. Write two **adapted** files, generated fresh (not copied) — the same
   "generate, don't blindly copy" approach v17 used for `HANDOFF.md`:
   - `SKILL.md`: identical structure and steps, but with the "plh-ops
     team format that Takeshi's analysis agent reads" framing replaced
     with a generic "your team's daily report format," and the output
     template's `business: PLH` line replaced with the installing
     company's own name.
   - `Setup.md`: identical bootstrap flow (auto-detect → confirm person
     → confirm projects → write config → register the scheduled task),
     but Step 0's "clone `takeman555/plh-ops`" logic is replaced with
     "use this company's own directory" (`output_repo` becomes
     `<company rootPath>/reports`, which already exists as a real git
     repo — nothing to clone), the `Eito`/`Lucce`/`Nana` example names
     are removed in favor of plain free-text "who are you," and the
     symlink-into-`~/.claude/skills` step (Step 4.5 in the original,
     needed because `plh-ops`'s real files live in a `workflow/`
     subfolder) is dropped entirely — installed directly into
     `.claude/skills/daily-team-log/`, it's already a discoverable
     project skill with no extra step needed.
3. Commit the new `.claude/skills/daily-team-log/` directory via the
   existing `commitFile`-style git helper.

The **bootstrap itself (Setup.md's actual auto-detect → ask → configure
→ schedule flow) still happens inside Claude Code afterward**, not the
web app — identical division of labor to v19's deferral to `api-connect`:
the dashboard's job is making the workflow *available*, not replacing
the agent-driven setup conversation.

## Known limitation (disclosed, not fixed here)

`gather.py`'s config lives at a **fixed, global, per-machine path**
(`~/.claude/daily-team-log/config.json`), confirmed by reading its
`load_config` function — not scoped per-installation. If a machine
already has `daily-team-log` bootstrapped for one company (or for
`plh-ops` itself, as this development machine does), running `Setup.md`
for a second company's installed copy would overwrite the same global
config rather than keeping the two independent. This is a real
constraint of `gather.py`'s current design, not something this slice
fixes — redesigning its config storage to be per-installation would be
exactly the "generalize the format" work the user explicitly chose not
to do. This limitation is documented in the installed `SKILL.md` itself
and in this project's `README.md`, so it's disclosed rather than a
silent trap.

## Non-goals

- No general plugin/workflow package format, registry, or discovery UI
  beyond what v11/v17 already provide (the Skills page).
- No changes to `plh-ops`'s real `daily-team-log` files — read-only
  source for the copy step.
- No fix for the global-config collision described above.
- No changes to `plh-takeshi-agent` or its `plh-dev-team` skill — not
  attempted as an install target; confirmed too tightly coupled to
  Kirirom to generalize in this slice.
- No actual execution of the bootstrap flow, scheduled-task registration,
  or report generation from the web app — Claude Code still does all of
  that, exactly as today.

## Testing

The file-copy step (verbatim) and the two generated-file builders are
tested against a disposable `/tmp` fixture standing in for `plh-ops`
(never the real `plh-ops` directory) and a disposable `/tmp` target
company. Cases: `gather.py`/`config.example.json` copied byte-for-byte;
the generated `SKILL.md` contains the target company's name in the
`business:` field and does not contain the literal string "PLH" or
"Takeshi"; the generated `Setup.md` references the target company's own
`rootPath`-based output location and does not contain "takeman555" or
"plh-ops"; installing twice is idempotent (second install overwrites
cleanly, doesn't duplicate or error); the "already installed" check
correctly hides the action once `.claude/skills/daily-team-log/` exists.
Live verification: install onto a disposable `/tmp` company created via
v17's own flow, confirm the 4 files land correctly with the right
adapted content, confirm exactly one new commit, confirm
`plh-ops`'s real `daily-team-log` files are never modified (read-only
source), clean up.
