# The HITL (Human-In-The-Loop) Gate principle

> AI is fast and can do a great deal. Precisely because of that, a human approval step goes
> immediately before "the step you can't take back". Everything else can be left to the AI.

## 1. Why a HITL Gate is needed

Because an AI agent can go from proposal to execution in one continuous run, there is a risk it executes
hard-to-reverse operations — money, contracts, publication — without a review step in between.
Having a human approve every single operation would negate the AI's speed.
The HITL Gate strikes a **balance between speed and safety** by writing down in advance where to stop.

## 2. Trigger table

Any operation matching one of the following must pause before execution and obtain human approval.

| Category   | Examples                                                                                    | Threshold                                                   | Escalate to |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| Money       | Payments, transfers, issuing invoices, subscription contracts                              | Anything over the equivalent of $100, or anything cumulative or recurring | Repository owner |
| Contracts   | Signing a contract, changing contract terms, entering an NDA                               | All, regardless of amount                                   | Repository owner |
| Irreversible operations | `git push --force`, deleting production data, deleting a branch with `-D`, destructive DB migrations | All                                                         | Repository owner |
| Publication | Changing a repository's visibility to public, external communications (social posts, press releases, etc.) | All                                                         | Repository owner |
| Credentials | Rotating API keys or credentials, granting or revoking permissions, issuing new accounts   | All                                                         | Repository owner |

Even in cases not written explicitly above, if you judge that something is "hard to undo", "externally visible"
or "involves money", put it through the HITL Gate to be safe.

> Note that of the "irreversible operations" row, `git push --force` (excluding lease-based forms such as
> `--force-with-lease`) and `git branch -D` are mechanically blocked before execution by the blocking layer of
> `.claude/hooks/git-ops-validator.sh` (exit 2). The other rows in the table (deleting production data,
> `reset --hard`, destructive DB changes, etc.) continue to be assured by operational rules (explicit human approval).

## 3. What to do when a trigger fires

1. **Pause** — do not execute on the spot. Do not move on to the next action.
2. **Summarise the request** — state briefly what you are about to do, why, and within what scope.
   Spell out the blast radius (who can see it / what changes / whether it can be undone).
3. **Wait for explicit approval** — wait for a clear "OK", "go ahead" or similar from the user.
4. Once approval is given, execute, and report the result afterwards.

## 4. What you must not do

- **Do not treat silence as approval** — you must not interpret the user moving on to another topic, or being
  slow to reply, as "implicit approval". Approval must always be explicit.
- **Do not split a request to get under the threshold** — for example, you must not propose or execute a $250
  payment as "three payments of $90" so each one appears to fall below the threshold and thereby dodge the
  HITL Gate. Judge on the total and the cumulative impact.
- **Do not execute first and confirm later** — the order "execute first, then ask" is forbidden.
  Irreversible operations have a high cost to undo, so confirmation always precedes execution.
- **Do not wave something through mechanically just because it isn't in the trigger table** — the trigger table
  gives representative examples, not an exhaustive list. Treat anything you're unsure about as a grey area, stop and confirm.

## 5. Adding your own triggers

The trigger table is a starting point, and is designed on the assumption you will add rows to fit your own
circumstances. Examples of additions:

- Exporting customer data (treated like contracts or irreversible operations, from a personal-data protection standpoint)
- Customising prices or terms for a specific customer
- Notifying a job applicant of the outcome

Add the row directly to the table in this file and commit it (it is even better to record why you added it as a
Decision RFC in `docs/decisions/`).

However, the table in §2 of this file is the **category list of judgement principles (the conceptual overview)**,
and adding to the table alone is not mechanically reflected in HITL-02 in `scripts/verify.py`. To make a trigger
subject to machine verification as the **operational SSOT**, add the same trigger as a single file at
`definitions/hitl/triggers/<slug>.yaml` (see `definitions/hitl/triggers/_schema.md` for how to write it, and match
the approver roles to `definitions/hitl/approver-registry.yaml`). The yaml side is what verify checks, and the md
table and the yaml do not need to correspond 1:1 (md = conceptual categories / yaml = operational SSOT).

## 6. Related rules

- `.claude/rules/issue-first.md` — work matching the HITL Gate also requires an Issue (see §1 of this rule)
- `.claude/rules/scope-contract.md` — declaring the scope of execution and the HITL Gate are independent
  mechanisms, but irreversible operations should be checked from both angles

---

_ai-retreat-starter — the HITL Gate principle_
