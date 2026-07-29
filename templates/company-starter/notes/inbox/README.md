# notes/inbox/ — the owner's inbox

This is the **only shelf the owner may write to freely**. While on the move or right after a
meeting, drop notes in freely from Obsidian (desktop / mobile) or your everyday editor,
without worrying about frontmatter.

- It's git-tracked (so the agent can read it in the next session).
- Don't write confidential data here — real names, real amounts, credentials (when unsure,
  use `secrets/`).
- Notes left here get quarantined and classified by the agent via `/ingest-context`, then
  promoted to the correct shelf (`notes/company/` `notes/market/` `notes/clients/`
  `notes/sops/`, or `definitions/` if it's structural information). There's no need to write
  directly to a shelf.

Example filename: `2026-07-03-memo.md` (putting the date first makes it easier to check for
things going stale).

## Mobile-capture sync procedure

The agent can only read a memo **once it's landed in git**. The essence of syncing is "it
eventually reaches the repo" — real-time delivery isn't necessary. Below are 2 patterns for
syncing.

### The minimum baseline (recommended default, zero extra tooling)

1. Right after a meeting, draft it with whatever mobile note-taking method you like (the
   stock notes app, Obsidian mobile, anything)
2. When you're next at your PC with the repo open, paste the draft into a new file under
   `notes/inbox/`
3. `git add notes/inbox/ && git commit && git push`

That alone is a fully workable setup. No extra tool or plugin is required.

### An advanced setup (optional)

You can also choose to sync the vault directly via git using Obsidian mobile + a community
plugin (e.g. Obsidian Git). The configuration depends on your own environment (OS, git auth
method, etc.), so this README doesn't pin down fixed steps. If a sync plugin behaves
unreliably, don't force yourself to keep using it — fall back to the "minimum baseline"
workflow above.

### Important (mandatory)

If you use Obsidian Sync or a third-party sync service, always exclude `secrets/` and `.env`
from what gets synced. `.gitignore` only affects syncing via git — it has no effect on
Obsidian Sync or other proprietary sync mechanisms. See APP-2 in
[`docs/decisions/2026-07-03-obsidian-context-stock.md`](../../docs/decisions/2026-07-03-obsidian-context-stock.md)
for details.

This doesn't assume you'll use any particular vendor's paid service. This template keeps its
design of running on plain Claude Code + GitHub alone (syncing works with nothing more than
`git push`).
