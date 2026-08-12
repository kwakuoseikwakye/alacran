# Working agreement

Standing context for any AI agent working in this repository. Read this
first, then `HANDOFF.md` for where things currently stand.

## 1. What this repository is

The durable context for a business, in plain files. `definitions/` holds
declarative facts, `notes/` holds working material, `docs/` holds decisions
and retrospectives. Code, if any, is incidental — the value is the context.

**`definitions/` and `docs/` are the portable core.** `.claude/` is one
adapter for one tool. Never make the core depend on the adapter.

## 2. Before you change anything

- **Read before you write.** Especially `definitions/ontology/company.yaml`,
  which every other file assumes.
- **One concern per commit.** A commit that changes a definition and
  reorganises notes is two commits.
- **Facts change in `definitions/`, never in a note.** A note may *propose*
  a change to a definition; the definition file is where it lands.

## 3. Where things go

| If it is… | It goes in… |
| --- | --- |
| a fact that other files depend on | `definitions/` |
| something you're still working out | `notes/` |
| a decision, with reasoning | `docs/decisions/YYYY-MM-DD-<slug>.md` |
| a look back at how something went | `docs/retros/YYYY-MM-DD-retro.md` |
| generated output | `state/` |
| a credential | nowhere in this repo. `secrets/`, untracked, or a keychain |

## 4. Session flow

1. Read this file and `HANDOFF.md`.
2. If `definitions/ontology/company.yaml` doesn't exist, run
   `/define-company` before anything else.
3. Do the work. Record decisions as you make them, not at the end.
4. Run `/verify` before committing.
5. Run `/handoff` to record where things stand.

## 5. Hard rules

- **Never commit a secret.** If you think you just did, stop and say so.
- **Never invent a fact to fill a gap.** An unknown is `<<TODO>>`, not a
  plausible guess. A confidently wrong ontology is worse than an empty one.
- **Never rewrite someone's note to agree with you.** Add yours beside it.
- **No fake green.** If `/verify` fails, report the failure. Don't work
  around the check.
