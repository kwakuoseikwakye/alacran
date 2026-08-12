# definitions/

Declarative facts about the business. **This is the source of truth** — when
a note and a definition disagree, the definition wins, or the definition gets
changed.

| Path | Holds |
| --- | --- |
| `ontology/company.yaml` | Who you serve, who does the work, what you sell. Written by `/define-company`. |
| `triage/senders.yaml` | Allowlist of who `/triage-email` will act on. Copy from `senders.example.yaml`. |
| `triage/repos.yaml` | Repos `/triage-email` may route a request to. Copy from `repos.example.yaml`. |
| `integrations/google.yaml` | Which Google accounts this company uses. Written by Alacrán's account picker. |

## Rules

- **A change here is a real change.** Read the file before editing it, and
  say what you changed and why in the commit message.
- **`<<TODO>>` is a valid value. A guess is not.** Everything downstream
  trusts these files.
- **The two `triage/` config files are fail-closed.** Missing or empty means
  "accept nothing", never "accept everything".
- Nothing in here is generated. If a file can be regenerated, it belongs in
  `state/`.
