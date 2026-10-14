---
name: define-company
description: Interview the user about their business and write definitions/ontology/company.yaml — the file every other command assumes exists
---

# /define-company

Turn what the user knows about their business into
`definitions/ontology/company.yaml`. This is the first command a new company
runs, and the one every other command depends on.

## Before you start

Read `docs/templates/ontology-starter.yaml` for the three-domain structure the
output must follow. **Do not edit that file** — it is a reference shape. You
write `definitions/ontology/company.yaml` only.

If `definitions/ontology/company.yaml` already exists, read it, then ask
whether to revise it or start over. Never silently overwrite it.

## The interview

Ask **one question at a time** and wait for the answer. A wall of questions
gets a wall of vague answers. Work through, in this order:

1. **What does the business do, in one sentence?** In the user's own words.
   Don't help them make it sound better.
2. **Who is it for?** Push for a specific group, not "everyone who needs X".
   For each group: what are they actually trying to get done, and what do
   they do today instead?
3. **Who does the work, and who decides?** Roles, not names. Then: which
   decisions need whose approval? This is what tells an agent when to stop
   and ask.
4. **What do they sell, and what does the buyer get?** The promise, not the
   feature list. Pricing if they have it.
5. **How does someone go from interested to paid and delivered?** One step at
   a time, with an owner for each.
6. **Which of those steps is the bottleneck right now?** There is usually one
   that matters. Ask them to pick one.

## Then write it

- Follow the starter's structure exactly: `customer`, `org`, `product`.
- **Anything the user didn't answer is `<<TODO>>`.** Never fill a gap with a
  plausible guess — everything downstream trusts this file, so a confident
  invention is worse than a visible blank.
- Use short slug ids (`smb-retail`, not `Small and Medium Retail Businesses`)
  and reference roles by id in `product.value_flow[].owner`.
- Set `meta.updated` to today's date.

## Finally

Read the finished file back to the user in plain language — not YAML — and
ask if anything is wrong. Then stop. Do not commit; the user reviews the diff
first.
