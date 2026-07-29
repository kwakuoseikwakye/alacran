# docs/retros/ — where retrospective records live

Cycle/session retrospectives (KPT: Keep / Problem / Try) live here. The `/retro` command
generates `docs/retros/YYYY-MM-DD-retro.md` (`CLAUDE.md` Phase 5: Record).

- **Naming convention**: `YYYY-MM-DD-retro.md` (a one-off retrospective), or
  `<team-id>/weekly/<YYYY-Www>.md` / `<team-id>/monthly/<YYYY-MM>.md` (when running cycle
  operations). The latter matches `scripts/cycle/retro-render.py`'s output location.
- **Structure**: sections for `Keep` / `Problem` / `Try` / `Next actions`. For cycle
  operations, add a monthly `continue / extend / pivot / retire` pivot decision on top.
- Improvement actions born out of `Try` carry forward into the "Next up" section of
  `HANDOFF.md` at the start of the next session.

## Reference sample

- [`ec-team/weekly/2026-W27.md`](./ec-team/weekly/2026-W27.md) — a filled-in, complete
  example weekly retro (for the fictional EC company Harukaze-EC). The source data is
  `examples/harukaze-ec/definitions/retro/ec-team-retrospective.yaml`.
