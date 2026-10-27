# scripts/

Code this company runs. `verify.py` checks the repository before a commit.

## Unattended jobs

A script listed in `definitions/jobs.yaml` runs every day at its time, with
no AI. Alacrán runs it from the company folder with a small, fixed
environment and stops it after 10 minutes.

```yaml
# definitions/jobs.yaml
jobs:
  - id: welcome-followup
    run: scripts/welcome_followup.py   # .py, .mjs, .js or .sh
    at: "08:15"                        # local time, 24-hour
    note: Re-send the invite to anyone who hasn't joined yet
```

**Every job starts in practice mode.** Alacrán sets `ALACRAN_DRY_RUN=1` and
refuses every send, so a practice run changes nothing outside this folder.
The owner puts a job live from the Jobs page.

**A job never sends by itself.** It writes a report to the file named in
`ALACRAN_REPORT`, and Alacrán sends only what an approved send policy allows:

```json
{
  "did": ["Checked 14 sign-ups"],
  "flagged": [{ "item": "row 7", "reason": "Paid by someone else; who should get the invite?" }],
  "outcome": { "label": "Still not joined", "value": 3 },
  "send": [{ "policy": "welcome-invite", "to": "ama@example.com", "fields": { "name": "Ama" } }],
  "hold": [
    {
      "row": "publication",
      "title": "Remind Kofi about invoice 42",
      "detail": "30 days overdue; no send policy covers reminders.",
      "mail": { "to": "kofi@example.com", "subject": "Invoice 42", "body": "Hi Kofi, ..." }
    },
    { "row": "money", "title": "Pay the printer £120", "detail": "Invoice 881, due Friday." }
  ]
}
```

- `did` — what happened, in plain words.
- `flagged` — anything the script couldn't decide. It goes to Approvals for a
  person. Guessing is never right here.
- `outcome` — the one number that says whether the job is working.
- `send` — who to send to, under which policy, with which fields.
- `hold` — a one-off step that needs the owner's OK first: `row` is
  `publication` (anything leaving the company), `money` (spending, paying,
  quoting) or `credentials` (granting or removing access), with a short
  `title` and a `detail`. A `publication` step may carry one Outlook `mail`
  (`to`, `subject`, `body`). Alacrán holds it in Approvals and does nothing
  else: a held mail is sent only when the owner approves that one message,
  exactly as written. A `money` or `credentials` step is never carried out by
  Alacrán; approving it records the owner's yes and the owner does the step.
  The same step held again while it still waits is not added twice; one
  whose send failed is offered again when the job holds it on a later run.
  Hidden zero-width or text-direction characters are refused, so the owner
  approves exactly what is sent. One
  malformed entry rejects the whole report, so nothing from it is held or sent.

Every email a live job sends, or tries to send and fails, gets one line in
`records/actions/<YYYY-MM>.md`, committed on its own; so does every yes or no
the owner gives a held step. Alacrán writes that log and only ever appends to
it. A script or an AI never writes there, and never edits a line.

A run that exits with an error sends nothing. Match records by `id`, never by
row position, and never change a field listed in a records file's
`human_fields:`.

## Send policies

```yaml
# definitions/send-policies.yaml
policies:
  - id: welcome-invite
    channel: outlook
    template: docs/templates/welcome-invite.md
    fields: [name]
    max_per_recipient: 2      # default 2
    min_days_between: 3       # default 3
    max_per_run: 10           # default 10
    stop_list: definitions/do-not-contact.yaml   # optional: a list of addresses
```

The template's first line is `Subject: ...`, then a blank line, then the
body. `{{name}}` is replaced with the field. Nothing sends until the owner
approves the policy on the Jobs page; changing the template or the limits
stops it until it is approved again.
