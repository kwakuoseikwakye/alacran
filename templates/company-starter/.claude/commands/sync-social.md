---
name: sync-social
description: Record audience and follower snapshot in records/social/snapshots.yaml for tracked social accounts
---

# /sync-social

Record a social audience and follower snapshot in `records/social/snapshots.yaml` for this company's tracked accounts.

## Rules

1. Read `records/social/accounts.yaml` to see the tracked platforms (x, linkedin, youtube, etc.) and accounts.
2. Read `records/social/snapshots.yaml` first. Each snapshot record must follow the schema:
   - `id`: e.g. `snap-YYYY-MM-DD-<platform>`
   - `timestamp`: RFC 3339 timestamp in UTC
   - `platform`: platform name
   - `followers`: integer follower count
   - `metrics`: optional metrics (posts_count, engagement_rate)

3. **Stop at the gate.** Never publish a tweet, post, reply, or direct message. This run is strictly read-only for follower analytics.

Write only `records/social/snapshots.yaml`. Do not run any commands or commit.
