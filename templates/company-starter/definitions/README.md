# definitions/

Declarative facts about the business. **This is the source of truth** — when
a note and a definition disagree, the definition wins, or the definition gets
changed.

| Path | Holds |
| --- | --- |
| `ontology/company.yaml` | Who you serve, who does the work, what you sell. Written by `/define-company`. |
| `preferences.md` | Your standing preferences for how drafts should be written. Created from your own change requests, only after you approve each line. Delete a line to stop it applying. |
| `triage/senders.yaml` | Allowlist of who `/triage-email` will act on. Copy from `senders.example.yaml`. |
| `triage/repos.yaml` | Repos `/triage-email` may route a request to. Copy from `repos.example.yaml`. |
| `integrations/google.yaml` | Which Google accounts this company uses. Written by Alacrán's account picker. |
| `jobs.yaml` | Scripts in `scripts/` that Alacrán runs every day, with no AI. Each starts in practice mode and sends nothing until put live from the Jobs page. |
| `send-policies.yaml` | The messages jobs may send without asking each time: a template, a per-person cap, days apart, an optional stop list. Nothing sends until the owner approves the policy in Alacrán. |

## Rules

- **A change here is a real change.** Read the file before editing it, and
  say what you changed and why in the commit message.
- **`<<TODO>>` is a valid value. A guess is not.** Everything downstream
  trusts these files.
- **Structure, not personal detail.** A client's `id`, `stage` and rough size
  belong here; their contact details, application content, ticket contents and
  exact negotiated terms do not. Those go in `notes/` if they're working
  material, `secrets/` if they're sensitive, and nowhere at all if the work
  doesn't need them. Every command reads this file, and every export carries it.
- **The two `triage/` config files are fail-closed.** Missing or empty means
  "accept nothing", never "accept everything".
- Nothing in here is generated. If a file can be regenerated, it belongs in
  `state/`.
