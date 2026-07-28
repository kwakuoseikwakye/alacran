# notes/ — L2 記述層（Obsidian 互換コンテキストストック）

本ディレクトリは `docs/decisions/2026-07-03-obsidian-context-stock.md`（Decision RFC, accepted）
に基づく **L2 記述層** です。物語・観察・手順を frontmatter 付き Markdown で蓄積します。
Obsidian（デスクトップ / モバイル）で本リポジトリを vault として開くと、GUI 閲覧・キャプチャが
できますが、**Obsidian が無くても plain Markdown + YAML として一切劣化しません**（アプリ非依存原則）。

## 2 層構造

| 層 | 場所 | 役割 |
|----|------|------|
| **L1 機械層（SSOT）** | `definitions/**/*.yaml` | 事業構造の宣言的定義。本ディレクトリとは無関係、変更なし |
| **L2 記述層（本ディレクトリ）** | `notes/`・`docs/decisions/`・`docs/retros/` | 物語・観察・手順。frontmatter で L1 に id 参照 |

L2 → L1 の参照は frontmatter の `entities:` / `client:` / `team_id:` で行う。wikilink で L1（YAML）
を指さない。詳細は RFC 本体を参照。

## 棚（サブディレクトリ）

| 棚 | 内容 | 命名規則 |
|----|------|----------|
| `company/` | 自社の物語（沿革・戦略メモ・経営方針の背景） | 自由 |
| `market/` | 他社情報（競合・市場・パートナー候補）。`source:` `observed_at:` 必須 | `<slug>.md` |
| `clients/` | クライアントの随時メモ（商談メモ・議事録の非機密要旨） | `<client-slug>/YYYY-MM-DD-<topic>.md` |
| `sops/` | 業務手順（SOP） | `<slug>.md` |
| `inbox/` | 未分類の生メモ。**唯一オーナーが自由に書いてよい棚** | 自由（詳細は `inbox/README.md`） |

## frontmatter 共通スキーマ

L2 の全ノートは以下のキーを持つ（型ごとの必須キーは RFC §3 を参照）。

```yaml
---
type: company-note | market | client-note | sop | inbox | decision | retro | digest
status: draft | active | superseded
created: 2026-07-03 # 絶対日付のみ
updated: 2026-07-03
tags: []
---
```

## 書き込み規約

- **オーナー**は `notes/inbox/` にのみ自由記述してよい。`definitions/`（L1）や `notes/` の棚
  （`company/` `market/` `clients/` `sops/`）への直接新規配置は行わない。
- inbox から棚への**昇格は `/ingest-context` 経由**で行う（検疫 → 分類 → 格納）。inbox モードは
  実装済み（Issue #73）で、`/ingest-context inbox` を実行すると未処理ノートを一括で検疫・分類・
  格納する。
- 実名・実額・認証情報は inbox にも書かない（迷ったら `secrets/`）。

## リンク・記法規約（抜粋）

- wikilink（`[[...]]`）は L2 内・一意解決の場合のみ。ルート相対フルパス推奨
- embed `![[...]]`・block ref `^xxx`・Dataview / Bases クエリブロックは禁止（アプリ依存 + 偽緑リスク）
- callout（`> [!note]`）は許可（劣化しても引用ブロックとして読める）

詳細な設計根拠・段階導入計画（Phase A/B/C）は
[`docs/decisions/2026-07-03-obsidian-context-stock.md`](../docs/decisions/2026-07-03-obsidian-context-stock.md) を参照。

`notes/` を Edit / Write するときの規律（frontmatter 必須・書き込み規約・PII 境界）は
[`.claude/rules/notes-touch.md`](../.claude/rules/notes-touch.md) に集約されている（path-scoped rule。
`notes/**` を触ると自動でロードされる）。本 README との重複を避けるため、詳細はそちらを正とする。
