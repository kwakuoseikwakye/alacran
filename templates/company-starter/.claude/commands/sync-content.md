---
name: sync-content
description: Reconcile this company's publication pipeline in records/content/items.yaml
---

# /sync-content

Reconcile this company's publication pipeline in `records/content/items.yaml`.

## Rules

1. Read `records/content/items.yaml` first. Each content item must follow the schema:
   - `id`: unique content slug or identifier
   - `title`: content title
   - `status`: `idea` | `draft` | `review` | `scheduled` | `published` | `archived`
   - `type`: `post` | `article` | `newsletter` | `video` | `changelog` | `documentation` | `other`
   - `channel`: distribution channel
   - `author`: `agent` | `human`
   - `publish_date`: optional YYYY-MM-DD
   - `url`: optional published link
   - `summary`: optional brief summary
   - `provenance`: optional provenance metadata

2. Scan `notes/` and drafts to track new content ideas, reviews, or publication progress.

3. **Stop at the gate.** Never publish, schedule, or blast any content externally without explicit human confirmation. Keep items in draft or review.

Write only `records/content/items.yaml`. Do not run any commands or commit.
