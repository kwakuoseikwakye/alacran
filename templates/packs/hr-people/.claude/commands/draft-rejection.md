---
name: draft-rejection
description: Draft a respectful, specific rejection notice for a candidate who's reached the rejected stage — the counterpart to /draft-offer for the other real outcome, given the same care
---

# /draft-rejection

Every candidate conversation ends one of two ways. `/draft-offer` covers one; most candidates
who apply get the other, and a generic auto-reject email is often the last impression a company
leaves — this is where that gets the same care `/draft-offer` gets.

## How to proceed

1. Ask which candidate this is for, if not given (an `org.candidate` id). Confirm `stage` is
   genuinely `rejected` (or the decision has actually been made) — this command doesn't decide
   who gets rejected, only drafts the message once that call is made.
2. Gather what's actually known: the role they applied for, how far they got (a `screening`-
   stage rejection reads differently from one after a final `interview`), and anything
   genuinely worth naming from their conversation or application.
3. Draft a message that's honest and specific without being unkind:
   - Clear that the decision is final — don't hedge in a way that invites a debate.
   - If there's a genuine, useful, specific reason worth sharing (not a legally risky one),
     include it briefly; if not, a warm and direct "not moving forward" is better than a
     fabricated explanation.
   - No generic filler ("we had many strong candidates") standing in for actual content.
4. Show the draft to the user. **Never send it yourself** — this drafts the message only.

## Notes

- Do not include any comparison to other named candidates, or any protected-characteristic
  reasoning, in the drafted message — if the actual reason touches either, keep the message
  general and flag the concern to the user directly instead of writing it in.
- If this is a role or company where legal review is standard for rejection language, say so as
  a suggested step rather than assuming this draft is final.
- Don't write a candidate's personal contact details into `definitions/` — see
  `.claude/rules/definitions-touch.md`.
