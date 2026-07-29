# definitions/retro/ — the shape of retrospectives

Where you declare the shape of each cycle's retrospective (KPT: Keep / Problem / Try) and the
continue-or-reconsider decision (continue / extend / pivot / retire).

## How to generate it

Copy `docs/templates/retrospective-template.yaml` into this directory and fill it in as
`<team>-retrospective.yaml` (e.g. `ec-team-retrospective.yaml`).

- Fill in whichever of `weekly_retrospective` / `monthly_retrospective` matches your cycle unit —
  it's mandatory.
- Keep the 3 KPT sections (keep / problem / try).
- Write the monthly pivot decision as one of the 4 categories: continue / extend / pivot / retire.
- Fill in every `<<TODO_*>>`, and make the team explicit via `team_id`.

## Conventions when filling it in

- Promote a retrospective's outcome (a candidate Decision) to `docs/decisions/` (generated
  via `/decision`).
- The retrospective record itself lives in `docs/retros/` (the `/retro` command helps with
  this).

Filled-in example: `examples/harukaze-ec/definitions/retro/ec-team-retrospective.yaml`
