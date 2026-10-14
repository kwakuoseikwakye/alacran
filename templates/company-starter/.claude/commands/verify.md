---
name: verify
description: Run this company's own invariant checks (scripts/verify.py) and report the result honestly — no fake green
---

# /verify

Run the repository's own checks and report what they say.

```bash
python3 scripts/verify.py
```

## What it checks

- `secrets/` and `.env` are git-ignored, so the next commit can't leak them.
- `definitions/ontology/company.yaml` exists and has no `<<TODO>>` left.
- Every file in `docs/decisions/` has a Why/Reasoning section.

It does **not** scan for secrets already committed — that needs a real
scanner over the full history, which this script is not.

## Rules

- **Report failures verbatim.** Show the script's own output.
- **Never work around a failing check** — not by editing the check, not by
  adding an exception, not by narrowing what it looks at. If a check is
  genuinely wrong, say so and stop; changing it is the user's call.
- A failure is a result, not an error to hide. "2 problems, here they are"
  is a successful run of this command.
