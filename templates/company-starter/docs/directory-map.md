# Directory map — before and after filling in context

Shows, as a 3-stage tree, "how the folders change once you fill in your own company's and
clients' context." Items annotated **generated** are created at runtime by a command or by
cycle operations — they don't exist right after distribution. Everything else genuinely
exists at distribution time.

---

## (a) Right after distribution (the current state)

The shape right after cloning the template, before anything has been filled in.

```
company-starter/
├── CLAUDE.md                       # the operating constitution
├── README.md
├── LICENSE.md
├── HANDOFF.md                      # session handover (a placeholder in its initial state right after distribution)
├── .claude/
│   ├── settings.json
│   ├── hooks/
│   ├── rules/                      # scope-contract / issue-first / hitl-gate / definitions-touch
│   └── commands/                   # /define-company, /ingest-context, /create-epic,
│                                    # /verify, /handoff, /decision, /retro
├── .github/
│   ├── ISSUE_TEMPLATE/              # the feedback-* templates + config.yml
│   └── workflows/verify.yml         # CI (runs scripts/verify.py)
├── definitions/                    # ★the SSOT of your own company's context (skeleton only, README points to where to fill in)
│   ├── README.md
│   ├── ontology/README.md
│   ├── hitl/README.md + approver-registry.yaml + triggers/ (notation guide + 3 templates)
│   ├── kpi/README.md
│   ├── cycles/README.md
│   ├── retro/README.md
│   └── clients/README.md
├── examples/                       # ★filled-in samples (read-only)
│   ├── README.md
│   └── harukaze-ec/                # a complete example for a fictional EC company
├── docs/
│   ├── directory-map.md            # this file
│   ├── starter-manual.md
│   ├── ai-company-explainer.md     # background on the "AI autonomous management harness"
│   ├── concepts/                   # explanations of the design thinking (context-funnel / hitl-async-approval)
│   ├── simulations/                # onboarding-verification records (read-only)
│   ├── templates/                  # source templates to fill in from (ontology / kpi / cycle-plan / retrospective etc.)
│   ├── decisions/README.md         # guide to where Decision RFCs live (nothing there yet)
│   └── retros/README.md            # guide to where retrospective records live (nothing there yet)
├── state/README.md                 # guide to where business-cycle logs live (nothing there yet)
├── scripts/
│   ├── verify.py                   # the RQT-based verification runner
│   └── (cycle-operations helper scripts)
└── secrets/                        # confidential data only (gitignored, structure kept via .gitkeep)
    ├── customers/
    └── contracts/
```

---

## (b) After filling in your own company's context

The shape once `/define-company` and each template have been filled in. Each subdirectory
under `definitions/` now holds your own company's real data (`company.yaml`,
`<team>-*.yaml`), and operational records start accumulating.

```
company-starter/
├── HANDOFF.md                      # the file itself already existed at (a). Content: /handoff appends session results
├── definitions/
│   ├── ontology/
│   │   ├── README.md
│   │   └── company.yaml            # generated: /define-company (or copied from the template)
│   ├── hitl/
│   │   ├── README.md
│   │   └── triggers/               # your own company's approval triggers (bundled with the notation guide + 3 templates)
│   ├── kpi/
│   │   ├── README.md
│   │   └── ec-team-kpi.yaml        # copied from the template and filled in
│   ├── cycles/
│   │   ├── README.md
│   │   └── ec-team-cycle-plan.yaml # copied from the template and filled in
│   ├── retro/
│   │   ├── README.md
│   │   └── ec-team-retrospective.yaml
│   └── clients/README.md           # stays empty for a self-contained company
├── docs/
│   ├── decisions/
│   │   ├── README.md               # already existed at (a)
│   │   └── YYYY-MM-DD-*.md         # contents grow: /decision adds a Decision RFC
│   └── retros/
│       ├── README.md               # already existed at (a)
│       └── YYYY-MM-DD-retro.md     # contents grow: /retro adds a retrospective record
└── (everything else is the same as (a))
```

---

## (c) After operating with 2 clients

If you have clients (e.g. contracted or wholesale work), non-confidential structural
information grows under `definitions/clients/<slug>/`, one directory per company.
Confidential data goes to `secrets/customers/<slug>/` instead.

```
company-starter/
├── definitions/
│   └── clients/
│       ├── README.md
│       ├── midori-hotel/           # Client 1 (non-confidential structural information)
│       │   ├── profile.yaml
│       │   ├── ontology.yaml
│       │   └── engagement.yaml
│       └── aozora-cafe/            # Client 2 (same shape)
│           ├── profile.yaml
│           ├── ontology.yaml
│           └── engagement.yaml
└── secrets/
    └── customers/                  # confidential data (gitignored, never lands in git)
        ├── midori-hotel/           # real amounts, original contracts, contact details
        └── aozora-cafe/
```

---

## Which command/template produces which file

| Destination | Where it's generated/filled from | Kind |
|--------|----------------|------|
| `definitions/ontology/company.yaml` | `/define-company` (or copy `docs/templates/ontology-starter.yaml`) | Generated/filled in |
| `definitions/hitl/triggers/*.yaml` | Fill in the bundled templates (large-deal / incident / new-ontology-entity) | Filled in |
| `definitions/kpi/<team>-kpi.yaml` | Copy `docs/templates/kpi-measurement-template.yaml` | Filled in |
| `definitions/cycles/<team>-cycle-plan.yaml` | Copy `docs/templates/cycle-plan-template.yaml` | Filled in |
| `definitions/retro/<team>-retrospective.yaml` | Copy `docs/templates/retrospective-template.yaml` | Filled in |
| `definitions/clients/<slug>/{profile,ontology,engagement}.yaml` | Filled in by hand (the 3-file structure from `definitions/clients/README.md`) | Filled in |
| `HANDOFF.md` | `/handoff` | Generated |
| `docs/decisions/YYYY-MM-DD-*.md` | `/decision` | Generated |
| `docs/retros/...` | `/retro` | Generated |
| `secrets/customers/<slug>/*` | By hand (confidential data only, not git-tracked) | Filled in (untracked) |

> **`docs/retros/` has 2 separate lineages.** `/retro` creates flat, per-session files at
> `docs/retros/YYYY-MM-DD-retro.md`. Meanwhile, `definitions/retro/<team>-retrospective.yaml`
> (the SSOT) declares an output location nested by team × frequency:
> `docs/retros/<team_id>/weekly/` and `docs/retros/<team_id>/monthly/`. Both coexist under
> `docs/retros/`, but note that they're separate records with different origins and
> granularity.

> If you want a picture of the finished state, open `examples/harukaze-ec/` (a complete,
> filled-in set for a fictional EC company).
