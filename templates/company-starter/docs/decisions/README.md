# docs/decisions/

One file per decision: `YYYY-MM-DD-<slug>.md`. Written by `/decision`.

A decision file records what was chosen, what was rejected and why, and what
would change our mind. `/verify` fails any file here without a
Why/Reasoning section — a decision without its reasoning can't be evaluated
later, only obeyed.

Decisions aren't edited when they turn out wrong. Write a new one that
supersedes the old (`supersedes:` in the frontmatter) and leave the original
standing. The wrong turn is part of the record.
