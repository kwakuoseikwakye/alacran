# Retreat day-of flow — for instructors/facilitators

> Audience: instructors/facilitators running the day of the retreat.
> Prerequisite: participants have finished pre-retreat prep (the 15-minute setup) following
> `docs/participant-guide.md`.

---

## Expected timeline

Depending on how long the retreat runs, we provide 2 patterns: Half-day (4 hours) and
Full-day (8 hours). Both are built around `exercises/01-03`, with time set aside for
participants to apply the material to their own real work.

### Half-day pattern (4 hours)

| # | Duration | Session | Corresponding file |
|---|---|---|---|
| 1 | 15 min | Setup check (confirm pre-retreat prep works, help anyone stuck) | `docs/setup-walkthrough.md` |
| 2 | 30 min | `/define-company` — define your company ontology | `exercises/01-define-your-company.md` |
| 3 | 30 min | File your first Epic Issue (`/create-epic`) | `docs/starter-manual.md` §4 |
| 4 | 30 min | Experience the HITL Gate | `exercises/02-first-hitl-gate.md` |
| 5 | 30 min | Experience the `/verify` loop | `exercises/03-run-verify-loop.md` |
| 6 | 60 min | Each participant files and starts implementing their own real-work Epic (instructor circulates) | — |
| 7 | 15 min | Retrospective | This file, §How to run the retrospective |

Total: 3 hours 30 minutes + 30 minutes of buffer (for equipment trouble/extended Q&A)

### Full-day pattern (8 hours)

Adds the following on top of the Half-day content. Run it split across morning and
afternoon, with a lunch break in between.

| # | Duration | Session | Corresponding file |
|---|---|---|---|
| 1 | 15 min | Setup check | `docs/setup-walkthrough.md` |
| 2 | 30 min | `/define-company` | `exercises/01-define-your-company.md` |
| 3 | 30 min | File your first Epic Issue | `docs/starter-manual.md` §4 |
| 4 | 30 min | Experience the HITL Gate | `exercises/02-first-hitl-gate.md` |
| 5 | 30 min | Experience the `/verify` loop | `exercises/03-run-verify-loop.md` |
| — | 60 min | Lunch break | — |
| 6 | 45 min | Experience creating a Decision RFC (`/decision`) | `.claude/commands/decision.md` (the template is built into the command) |
| 7 | 45 min | Experience defining a KPI (`docs/templates/kpi-measurement-template.yaml`) | `docs/templates/kpi-measurement-template.yaml` |
| 8 | 120 min | Each participant files and starts implementing their own real-work Epic (instructor circulates) | — |
| 9 | 45 min | Instructor office hours (5-10 min of individual Q&A per person) | — |
| 10 | 30 min | Retrospective | This file, §How to run the retrospective |

Total: 7 hours + 1 hour lunch = 8 hours

In either pattern, session 6 (Half-day) / session 8 (Full-day) — applying it to real work —
is the most important. Instructors should prioritize time management so the earlier
exercises don't eat into it.

---

## Per-session instructor tips

### Setup check (15 min)

- Proceed assuming a certain number of participants haven't finished pre-retreat prep.
  Have everyone confirm together via screen share just the 3 commands: `claude --version` /
  `gh auth status` / `python3 scripts/verify.py`.
- For participants where `gh auth login` isn't complete, it's often because the browser
  authentication popup is being blocked. Guide them to unblock popups.
- If it's not resolved within this session, allow "pairing temporarily on a neighboring
  participant's PC" and be sure to move on within the time allotted.

### `/define-company` (30 min)

- Claude Code asks 4 questions in order (business domain, stakeholders, core value flow,
  bottleneck). If they're asked all at once, `CLAUDE.md` may have failed to load — have them
  restart `claude`.
- This is a session where many participants freeze up trying to give "the correct answer."
  Tell them ahead of time it's fine to leave things as `status: draft`. The goal isn't a
  perfect definition — it's getting to a state that can be fixed later.
- Have them use what they thought through ahead of time (the participant guide's §Things to
  think about before the retreat) in this session. For anyone who hasn't thought about it at
  all, encourage a quick back-and-forth with a neighboring participant.

### Filing your first Epic Issue (30 min)

- It's fine to have them use the title/body format from `docs/starter-manual.md` §4's example
  for `gh issue create` as-is. There's no need for elaborate writing.
- Verbally emphasize the principle that a composite task gets broken into child Issues. A
  certain number of participants try to cram everything into one Epic and call it done.
- Having them actually type the Issue number into a branch name/commit message at this point
  is effective for making it stick.

### Experiencing the HITL Gate (30 min, ex02)

- The design question of "what to delegate to the AI, and what a human holds onto" varies a
  lot by the participant's industry. Finance/healthcare participants tend to lean strict, and
  others tend to lean loose — proceed on the assumption both are valid answers.
- The goal is the exercise of having them read the trigger table in
  `.claude/rules/hitl-gate.md` and then add 1-2 lines matching their own company. There's no
  need to have them rewrite the whole table.

### Experiencing the `/verify` loop (30 min, ex03)

- An exercise to add one company-specific RQT (verification item). Tell them the goal isn't
  to have them edit `scripts/verify.py` itself, but to put "what do I want to verify" into
  words.
- Make it clear in this session that "loosening the verification logic to force a pass" is a
  violation of the no-fake-green principle. This is a hands-on session for the principle that
  when a FAIL appears, you fix the implementation, not the check.

### Experiencing creating a Decision RFC (45 min, Full-day only)

- Have them pick one "judgment call they were unsure about" that came up during the morning's
  `/define-company` or Epic filing, and record it as a Decision RFC with `/decision`. Pulling
  material from the morning's work is faster than having them think of something from
  scratch.
- The goal is having them write "why they made that decision" — many participants stop at
  just writing "what was decided." Check by circulating whether the Why section is filled in.

### Experiencing KPI definition (45 min, Full-day only)

- Have them apply `docs/templates/kpi-measurement-template.yaml` to their own bottleneck (the
  task they thought about ahead of time) and define 1-2 KPIs. Emphasize that the goal isn't
  building metrics for their own sake — it's practicing deciding, up front, "what counts as
  improvement."
- Participants who get too caught up in the exact numeric targets tend to run out the clock.
  Tell them early that a rough placeholder value is fine.

### Each participant files and starts implementing their own real-work Epic (60-120 min)

- The session where time allocation matters most. Instructors should circulate proactively —
  rather than waiting for a question, approach any participant whose progress looks stalled.
- Don't make "finishing the implementation" the goal. Share ahead of time that reaching the
  state where an Epic Issue is filed and `/verify` isn't FAILing is a sufficient bar.

---

## What facilitators should prepare

### Materials distributed ahead of time

- `docs/participant-guide.md` (confirm it was distributed 1-2 weeks before the retreat)
- The day's timeline (this file's expected-timeline table, printed or formatted for screen
  sharing)
- The venue's Wi-Fi information and power-outlet availability

### A dashboard to display on the instructor's PC

- Have a list of participant repository URLs on hand, so you can run
  `python3 scripts/verify.py`'s output against any participant's repo whose progress you want
  to check (easier to enumerate if you have a GitHub Organization)
- A list of participant repositories (a spreadsheet of GitHub usernames or repository URLs)
- A timer for time-keeping (being able to show each session's remaining time on screen makes
  running things easier)

---

## A collection of common participant sticking points

| # | Pattern | Symptom | Response |
|---|---|---|---|
| 1 | `verify.py` gives a `ModuleNotFoundError` | `pip install pyyaml` wasn't run | Have them run `pip3 install pyyaml` |
| 2 | Proceeding without `gh auth` complete | An API call errors out when running `/create-epic` | Send them back to `gh auth login` once. Suspect a blocked browser-authentication popup |
| 3 | About to commit `.env` into `secrets/` | Seeing `secrets/*.env` in `git status` causes panic | Explain it's protected by `.gitignore` and won't actually be committed, and walk through how to read `git status` |
| 4 | Freezes up choosing a business domain in `ontology-starter.yaml` | 30 minutes pass and `/define-company` still isn't done | Tell them "don't aim for perfection, it's fine to leave it as `status: draft`" and move them to the next session. Follow up individually during a break |
| 5 | Dives into a large change without using Claude Code's Plan Mode | The implementation sprawls and departs from the Scope Contract | Read `.claude/rules/scope-contract.md`'s "5-second check before starting" together, and have them put CHANGE/NOT CHANGE into words |
| 6 | Starts implementing without filing an Issue | Overlooked the Issue-First principle | Have them file an Issue even after the fact — that's fine — and switch to leaving a reference to it in the commit message |
| 7 | Tries to move on while ignoring a `/verify` FAIL | A violation of the no-fake-green principle | Read the FAIL's content together, and reconfirm the principle of fixing the implementation, not the verification logic |

---

## How to run the retrospective

A little before the session's end time (about 15 minutes before for Half-day, 30 minutes
before for Full-day), have everyone stop screen-sharing and run through sharing the following
3 things in order. About 1-2 minutes per person, with follow-up questions if time allows.

1. **How many times did `/verify` PASS today** — check whether they experienced turning a
   FAIL into a PASS, more than the raw count itself
2. **How many Epics did they file** — check the count filed and what fraction they managed to
   start
3. **Share one Ah-ha moment each** — have each person share "the thing that surprised them
   most about working alongside an AI agent"

Instructors should jot a brief note on each participant's remarks. Referencing these
individually in the post-retreat follow-up email (below) tends to raise participant
satisfaction.

---

## Post-retreat follow-up

About 1 week after the retreat ends, send participants a follow-up email like the following.

```
Subject: [1 week since the retreat] How's your repository doing since then?

Dear {{ name }},

Thank you for participating in the AI-driven management retreat.
It's been a week since the retreat — how has your repository been since then?

Regarding "{{ quote the relevant participant's remark from the retrospective notes }}"
that you shared in the retrospective — please let us know if there's been any progress.

If `/verify` is stuck FAILing, or you haven't been able to pick up where your Epic Issue
left off, please don't hesitate to reach out. We can also arrange a roughly 30-minute
online session to hear about your situation individually.

If you have any suggestions for improving the template, we'd appreciate it if you could
file them as an Issue following the process in docs/feedback-collection.md.

Looking forward to staying in touch.
```

Quoting an individual retrospective remark, rather than sending a purely generic email, tends
to create a "someone was actually paying attention" experience, and tends to raise the rate of
feedback given afterward. Organizers should build sending this email into their standard
process.

Always include, at the end of the follow-up email, a path to giving feedback per
`docs/feedback-collection.md` (filing an Issue against the template's own repository). A
week after, rather than right after the retreat, tends to surface more concrete friction
points from actually having used it.

---

## Division of roles on the day

For a session with a large number of participants (10+), one instructor alone won't be able
to keep up with circulating. Use the following as a rough division of roles.

| Role | Approximate headcount | Main job |
|---|---|---|
| Lead instructor | 1 | Overall facilitation, time-keeping, session intros |
| Assistant instructor / TA | 1 per 5-6 participants | Circulating, individual troubleshooting, taking retrospective notes |
| Organizer | 1 | Venue operations, confirming pre-distributed materials, handling day-of absences/lateness |

For a small session with no assistant instructor (5 or fewer), the timeline still works with
the lead instructor covering both roles. However, don't skip taking notes during the
retrospective session — it directly affects the quality of the post-retreat follow-up email.

---

## Anticipated Q&A and example answers

A collection of questions participants commonly ask on the day, with example answers. Reading
through these ahead of time makes handling them during sessions smoother.

**Q. Can what I answered in `/define-company` be changed later?**
A. Yes. Either edit `definitions/ontology/company.yaml` directly, or re-run
`/define-company` to overwrite it. Explain that, per the SSOT principle, this one file is
the sole authority on your company's definition.

**Q. About how many Epic Issues is it appropriate to file?**
A. There's no need to force filing a lot in one day of the retreat. Tell them that carefully
working through a scale that fits within the real-work session's time — roughly 1-2 — tends
to lead to better continued use after the retreat.

**Q. Is it OK to show this repository to other people at my company?**
A. As long as it stays within the private repository, inviting other in-house members as
collaborators is fine by itself. However, explain that redistributing the template itself
(providing it to another company or a third party) is prohibited under the license (see
`LICENSE.md`).

**Q. Can the commands used at the retreat (`/define-company` etc.) be used in another
repository at my company?**
A. Yes, copying the whole `.claude/commands/` directory into another repository will work.
However, this should stay within incorporating it into the participant's own project, not
redistributing the template as a whole.

---

## Venue/equipment checklist (1 hour before start)

To keep the day from stalling, confirm the following about 1 hour before start.

- [ ] Does the venue's Wi-Fi connect reliably? (network access is required for `gh`
      authentication and using the Claude Code CLI)
- [ ] Can screen projection be done without issue from the lead instructor's PC?
- [ ] Are there enough power strips for the number of participants? (laptop work continues
      for several hours)
- [ ] Is the time-keeping timer positioned where it's visible on the projected screen?
- [ ] Is the spreadsheet of participant repositories up to date?
- [ ] Have the instructors shared the organizers' emergency contact info (for venue/equipment
      trouble)?

For the Full-day pattern, prompting a quick sanity check (`claude --version` etc.) when
resuming after lunch also helps catch environment changes early — e.g. from an OS update
during the break.

---

## Variations on the retreat format

This file mainly assumes an in-person Half-day / Full-day session, but the same skeleton can
be reused for an online session or one spanning multiple days.

- **Online**: instead of circulating in person, we recommend running small groups in
  breakout rooms. Confirming the browser-authentication part of `gh auth login` in particular
  requires screen sharing
- **Multi-day**: always have participants run `/handoff` at the end of day 1, ending with
  `HANDOFF.md` updated. Start day 2 by reading through `HANDOFF.md` together
- **Small-group, on-site, hands-on style**: rather than using the timeline as-is, further
  increase the weight given to the real-work session, and it's fine to cover the exercise
  sessions with verbal explanation only, skipping the hands-on part

---

*ai-retreat-starter — retreat day-of flow*
