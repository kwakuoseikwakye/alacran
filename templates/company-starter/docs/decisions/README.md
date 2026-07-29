# docs/decisions/ — where Decision RFCs live

Decision RFCs live here so the reasoning behind a decision can be traced later. The
`/decision` command generates `docs/decisions/YYYY-MM-DD-<slug>.md` (`CLAUDE.md` Phase 5:
Record).

- **Naming convention**: `YYYY-MM-DD-<slug>.md` (`<slug>` is alphanumeric and hyphens only,
  2-4 words).
- **Frontmatter**: carries `date` and `status` (`proposed` / `accepted` / `superseded`).
- Existing Decisions are never overwritten. If the content changes, create a new file, and
  update the old file's `status` to `superseded` with a reference to the new file.
