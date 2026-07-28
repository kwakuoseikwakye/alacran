---
description: notes/** (L2 記述層) を編集する時だけ効く規律。frontmatter 必須・inbox 昇格規律・PII 境界を担保する。
paths:
  - notes/**
---

# notes/ を触る時のルール

> このファイルは `notes/` 配下（L2 記述層）に `paths:` スコープを張ったルールです。
> `.claude/rules/definitions-touch.md`（L1 機械層向け）と同型ですが、対象と規律の中身は異なります。
> 発火条件は definitions-touch.md と同じ制限を持ちます — Read で発火、Edit は直前の Read 経由で
> 間接的にカバー、新規 Write は既知の制限で発火しません（anthropics/claude-code#23478）。
> `notes/` は definitions-touch.md ほど厳しい write-path 保証層（PreToolUse hook）を持ちません。
> 理由は 0 節を参照。

## 0. 位置づけ

`notes/` は本テンプレの **L2 記述層**（`docs/decisions/2026-07-03-obsidian-context-stock.md` 参照）
です。`definitions/`（L1・宣言的 SSOT）とは別レイヤーで、物語・観察・手順を frontmatter 付き
Markdown で蓄積します。

- L1 と異なり `notes/` は Obsidian 互換規約を採用しており、書き込み主体にオーナー自身も含まれます
  （`notes/inbox/` に限る）。そのため definitions-touch.md ほど硬い hook 保証層は敷いていません。
  代わりに RFC §4 の「3 段の網」（オーナー原則・secret-scan CI・`/ingest-context` の検疫）で
  PII リスクを受けます。
- `notes/` を直したくなっても `definitions/` の構造そのものは変わりません。逆に構造情報
  （新規クライアント・KPI 変更等）に気づいたら、`notes/` ではなく `definitions/` 側を疑ってください
  （definitions-touch.md 参照）。

## 1. 触る前のチェック（5 秒）

Edit / Write を呼ぶ前に以下を確認してください:

1. ✅ frontmatter は共通スキーマ（2 節）を満たしているか
2. ✅ 書き込み先の棚は自分の役割に合っているか（3 節 — オーナーなら `inbox/` のみ）
3. ✅ 実名・実額・認証情報を直接埋め込もうとしていないか（4 節）
4. ✅ wikilink・embed 等の記法規約に違反していないか（5 節）

## 2. frontmatter 共通スキーマ（必須）

L2 の全ノート（`notes/` 配下および `docs/decisions/`・`docs/retros/`）は以下のキーを持ちます。
詳細と type 別必須キーは RFC §3 を参照してください。

```yaml
---
type: company-note | market | client-note | sop | inbox | decision | retro | digest
status: draft | active | superseded
created: 2026-07-03 # 絶対日付のみ（definitions-touch.md §2 と同じ原則）
updated: 2026-07-03
tags: []
---
```

- `digest`（`.claude/commands/digest.md` が生成）は集計結果であり SSOT ではない。
  本文冒頭に「本ファイルは集計結果であり SSOT ではありません」の注記を必須とする。

- `notes/inbox/` は例外です。オーナーが自由記述する棚のため frontmatter を強制しません。
  棚（`company/` `market/` `clients/` `sops/`）へ昇格する際に frontmatter を付与します
  （`/ingest-context` または `/stock-note` が代行）。
- 既存ファイル（本スキーマ導入前に作成されたもの）は遡及的に一括改変しません。

## 3. 書き込み規約（誰がどこに書いてよいか）

RFC §4 の役割分担をそのまま適用します。

| 主体 | 書いてよい場所 | 書いてはいけない場所 |
|---|---|---|
| オーナー | `notes/inbox/`（自由記述）、既存 L2 ノートの誤字修正 | `notes/company\|market\|clients\|sops/` への直接新規配置 |
| エージェント | 全棚（本規約に従う） | — |

- inbox から棚への昇格は `/ingest-context`（inbox モード）または `/stock-note` 経由で行います。
  棚に直接新規ファイルを置かないでください。
- `notes/inbox/` は git 追跡されます（gitignore にしない）。エージェントが次セッションで読めること・
  履歴が残ることが funnel の起点として必須なためです。

## 4. PII / 秘密情報の取り扱い

`notes/` は `definitions/` と同じく **git にコミットされる** 前提のフォルダです。
実名・実額・認証情報は `notes/inbox/` を含め一切書かないでください。

- 認証情報 → `secrets/`（`.gitignore` 対象）
- 顧客の実名・連絡先 → id（slug）で参照し、実データは別管理
- 契約金額の実額 → 範囲や桁数までなら可

判断に迷ったら `.claude/rules/hitl-gate.md` を再読み込みしてください。definitions-touch.md ほど
硬い機械的ブロックは無く、(a) オーナー自身のメモであること、(b) CI の secret-scan、
(c) `/ingest-context` の検疫、の 3 段で受けます（RFC §4）。

## 5. リンク・記法規約

- wikilink（`[[...]]`）は `notes/` 内・一意解決の場合のみ。ルート相対フルパス推奨
- L2 → L1 の参照は frontmatter の id（`entities:` / `client:` / `team_id:`）で行う。本文 wikilink で
  `definitions/` の YAML を指さない
- embed `![[...]]`・block ref `^xxx`・Dataview / Bases クエリブロックは禁止（アプリ依存 + 偽緑リスク）
- callout（`> [!note]`）は許可

## 6. Scope Contract との関係

`notes/` の変更は `definitions/` ほど慎重さを要しませんが、以下は避けてください:

- 複数ノートにまたがる一括リライト（「ついでに frontmatter を全部揃えよう」は既存ファイルの
  遡及改変にあたり、2 節の原則に反します）
- inbox の内容を検疫せずそのまま棚へ複製すること

---

*ai-retreat-starter — notes/ path-scoped rule（definitions-touch.md と対の L2 版）*
