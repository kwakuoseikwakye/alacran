# Feedback collection flow

> Audience: retreat organizers, the people maintaining the template. Can also be shared with
> participants as "how to give feedback."

---

## Why feedback is needed

This template isn't a "build it and you're done" thing. Friction that only becomes visible
once retreat participants actually get their hands on it (a confusing command, insufficient
documentation, an exercise whose difficulty doesn't match) can't be discovered by the
organizers alone.

The participant experience is something that accumulates and improves retreat by retreat, and
feedback collection is the entry point to that improvement cycle. The template itself follows
the SSOT principle and the no-fake-green principle, so it's important not to leave a state
where "it looks like it's working but is actually hard to use" unaddressed.

---

## Collection methods (3 channels)

### 1. GitHub Issues (recommended)

While working in their own private repository, a participant can also file an Issue for an
improvement they noticed in **the template's own repository**. Since their own repository is
an independent repo duplicated from the template, filing an Issue there never reaches the
organizers. Make sure the participant guide and the retreat day itself both make clear that
feedback should always be filed against the template's own repo.

Having them include the following when filing an Issue speeds up triage:

- What they were trying to do (which exercise, which command)
- What actually happened (the error message, behavior that differed from expectations)
- The behavior they expected
- Don't write anything touching your own company's confidential details — replace it with
  generalized wording instead (see §Privacy for details)

The template side classifies participant-originated Issues with the `feedback` label.

### 2. Post-retreat survey

After the retreat ends, the organizers run a semi-structured survey. Its structure is as
follows:

- 5 questions on a 5-point scale (e.g. clarity of pre-retreat prep / exercise difficulty /
  how the instructor ran things / tool stability / overall satisfaction)
- 3 free-text questions (e.g. what was good / what you'd like improved / what you want to
  keep using after the retreat)

Running and tallying the survey is the retreat organizers' responsibility. Among the
responses, points relevant to improving the template should be turned into Issues following
§Triage flow.

### 3. 1-on-1 follow-up (opt-in only)

For participants who opt in via the post-retreat follow-up email (see `docs/retreat-day-flow.md`
§Post-retreat follow-up), a roughly 30-minute online meeting is arranged with the instructor.
This is a chance to hear about how it's being used in real work, and about issues with
continued use that only surface after the retreat.

Among what comes up in these conversations, points relevant to improving the template should
be turned into an Issue only with the participant's consent, and anonymized (see §Privacy).

---

## The Issue label system (labels used on the template side)

In the template's own repository, feedback Issues are classified with the following labels.

| Label | Purpose |
|---|---|
| `feedback:content` | Opinions about the template's content (explanatory text, exercise structure, etc.) |
| `feedback:tool-friction` | Reports of friction with tools like `verify.py` / commands / hooks |
| `feedback:doc-gap` | Points to a place documentation is missing or unclear |
| `feedback:success-story` | A case that went well. Accumulated as a hint for improvement |
| `priority:critical` | Must be fixed before the next retreat |
| `priority:high` | Want to address within the next 2-3 retreat cycles |
| `priority:medium` | Something to consider over the medium term |
| `priority:low` | Address if there's spare capacity |

`feedback:*` describes the nature of the content, and `priority:*` describes urgency, so as a
rule an Issue gets both labels (e.g. `feedback:tool-friction` + `priority:high`).

---

## Triage flow (for the retreat organizers)

1. **Review Issues weekly** — check the list of Issues tagged with the `feedback` label
2. **Assign priority** — attach a `priority:*` label following the label table above. When
   unsure, use "would this same problem recur at the next retreat" as the criterion (if it's
   likely to recur, `high` or above)
3. **File a PR to reflect it in the template itself** — for `priority:critical` /
   `priority:high` Issues, file a PR that reflects the fix before the next retreat. Once
   addressed, close the Issue, with a brief note of what was done written in the Issue
4. **It's also fine to decide not to reflect it** — feedback rooted in one participant's
   specific circumstances, hard to generalize, may be closed. But always leave the reason for
   closing in the Issue (no silent closes)

---

## Broadcasting feedback that's been addressed

Feedback that's been reflected in the template is shared with participants/stakeholders via
one of the following:

- **CHANGELOG.md** (planned for a future phase) — recorded as a change log in the template's
  own repository
- **A periodic email** — summarizing a period's worth of improvements and sharing it with
  past participants

Since CHANGELOG.md isn't set up yet at this time, use the periodic email as the primary
channel for now, and consolidate onto CHANGELOG.md once it's added.

---

## Crediting participants

When feedback actually gets reflected in the template, we recommend leaving a note of thanks
to the contributing participant. Concretely, put the Issue filer (their GitHub display name,
or whatever name they prefer) in the trailer of the commit message for the change.

```
docs(exercises): clarify ex02's HITL trigger example

Reported-by: <the participant's display name, or omit if they prefer anonymity>
```

Whether to leave this credit should be decided after confirming the participant's
preference. If they prefer anonymity, omit the trailer, and also avoid leaving any personally
identifying information in the Issue body.

---

## Privacy

A participant's Issue may unintentionally contain their own company's confidential
information (specific revenue figures, business-partner names, unpublished business plans,
etc.). Use the following practices to keep the risk down:

- Instruct participants, when filing an Issue, to replace their own company's specific
  details with generalized wording (e.g. "the contract amount with a certain business
  partner" rather than "the contract amount with Company A")
- Before treating something as a public Issue, the organizers review its content, and if
  they judge it sensitive, they confirm with the participant, transcribe it to an internal,
  non-public channel, then sanitize the original Issue (delete/anonymize the sensitive parts)
- Information obtained during a 1-on-1 follow-up is never turned into an Issue without the
  participant's explicit consent
- Where possible, confirm with the participant themselves that the intent hasn't changed
  even after sanitizing

---

## Example Issue-filing template

Share the following structure with participants as a reference for filing an Issue. If you
set up an Issue form as `.github/ISSUE_TEMPLATE/` in the template's own repository, base it
on this structure too.

```markdown
## What were you trying to do
(which exercise, which command you were running)

## What actually happened
(paste the error message, or the behavior that differed from expectations, verbatim)

## What behavior did you expect
(what should have happened instead)

## Environment
- OS:
- python3 version:
- output of claude --version:

## Additional notes
(replace anything specific to your own company with generalized wording)
```

Including environment information speeds up isolating OS-dependent issues (e.g.
Windows/WSL-specific behavior).

---

## Aggregation and periodic review

Separately from the triage flow, we recommend a periodic review — roughly once a quarter —
to take a step back and look at accumulated feedback as a whole.

- Tally the Issue count by `feedback:*` label, to visualize which category friction is
  concentrated in
- `feedback:success-story` is especially easy to overlook, so pick it up deliberately.
  Success stories become material for improving the next retreat's exercise design and
  pre-retreat guidance
- If the same point keeps coming up across multiple retreats, consider reworking the
  document structure itself rather than a one-off PR

Where relevant, reflect the periodic review's results in `docs/retreat-day-flow.md`'s timeline
and instructor tips too. Feedback collection is part of the improvement cycle for the
operational documentation as a whole, not just the template itself.

---

*ai-retreat-starter — Feedback collection flow*
