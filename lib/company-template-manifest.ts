// Exact relative paths copied from ai-company-starter-main when
// scaffolding a new company. Every path here was individually verified
// to contain no company-specific data (see
// docs/superpowers/specs/2026-07-27-control-panel-v17-create-company-design.md
// for the full audit). Anything not listed here is never copied — this
// is an explicit allowlist, not a blocklist, so newly-added real content
// in ai-company-starter-main can never leak into a new company by
// accident.
//
// definitions/hitl is copied whole-folder because every file in it is
// currently a `<<TODO>>` placeholder template, not filled data — if
// this project ever fills those triggers in with real values in place,
// this entry needs to move to the file-level list below (see
// notes/company/.gitkeep for why: that folder holds real generated
// digests alongside its placeholder, so only the placeholder is listed).
export const TEMPLATE_MANIFEST: string[] = [
  ".claude/hooks",
  ".claude/commands",
  ".claude/rules",
  ".claude/skills",
  ".claude/settings.json",
  "docs/templates",
  "docs/concepts",
  "docs/ai-company-beginner-guide.md",
  "docs/ai-company-beginner-guide-lp.html",
  "docs/ai-company-explainer.md",
  "docs/context-gathering-checklist.md",
  "docs/directory-map.md",
  "docs/feedback-collection.md",
  "docs/participant-guide.md",
  "docs/retreat-day-flow.md",
  "docs/setup-walkthrough.md",
  "docs/starter-manual.md",
  "docs/decisions/README.md",
  "docs/retros/README.md",
  "exercises",
  "scripts/verify.py",
  "scripts/cycle",
  "tests",
  ".github",
  ".gitignore",
  "LICENSE.md",
  "README.md",
  "CLAUDE.md",
  "definitions/README.md",
  "definitions/ontology/README.md",
  "definitions/hitl",
  "definitions/kpi/README.md",
  "definitions/cycles/README.md",
  "definitions/retro/README.md",
  "secrets",
  "state/README.md",
  "notes/README.md",
  "notes/inbox/README.md",
  "notes/market/.gitkeep",
  "notes/clients/.gitkeep",
  "notes/sops/.gitkeep",
  "notes/company/.gitkeep",
]

export const FRESH_HANDOFF_CONTENT = `# HANDOFF — セッション引き継ぎ

このファイルは、セッションを跨いで「今どこにいるか・次に何をやるか」を伝えるための
引き継ぎノートです。\`CLAUDE.md\` §2.6「セッション引き継ぎ」の実装で、セッション終了時に
\`/handoff\` コマンドで追記していきます。

> **配布直後の状態です。** まだ運用セッションの実績はありません。
> 最初のセッションでは、下記「Next up」に沿って着手してください。

---

## はじめての方へ（最初のセッションの進め方）

1. \`CLAUDE.md\` §5「セッションフロー」の開始手順を読む（本ファイルと CLAUDE.md で現在地を把握）。
2. \`exercises/01\`（合宿当日の演習 1 本目）から着手する。
3. 自社コンテキストを入れ始めるなら \`/define-company\` → \`definitions/ontology/company.yaml\` を生成。
4. まとまった変更のあとは \`python3 scripts/verify.py\`（または \`/verify\`）で検証する（偽緑禁止）。
5. セッション終了時に \`/handoff\` で本ファイルを更新し、\`/decision\` \`/retro\` で記録を残す。

---

## Next up

- \`/define-company\` で自社コンテキストを記入する。
`
