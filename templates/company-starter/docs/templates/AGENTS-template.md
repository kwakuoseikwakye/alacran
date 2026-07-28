---
date: 2026-07-03
type: agents-template
---

# AGENTS Template — Agent システム設計指針

> **【本ファイルは optional / 参照用です】** 合宿本編（Phase 1〜5 の 5 サイクル）は
> plain Claude Code のサブエージェント機構と `.claude/commands/` の 7 コマンドだけで
> 完結します。本ファイルは「自社導入後に独自の agent role 体系を組みたくなったとき」
> のための設計指針であって、合宿演習の前提ではありません。
> `docs/templates/README-template.md` §2 でも `AGENTS-template.md` は「不要（参照のみ）」
> と分類されています。

> 任意の会社で自律 agent システムを立ち上げる際の **設計原則 + role 分類 + skeleton**。
> 本ファイルは「テンプレ側」: 抽象原則と命名規約を定義する。
> 実装側（具体 agent 一覧）は各社リポジトリ root の `AGENTS.md` に配置する。

---

## 1. Agent システムとは何か

複数の専門 agent が役割分担して 1 つの目的（タスク / サイクル / mission）を達成する仕組み。
本テンプレは Claude Code 標準のサブエージェント（Task/Agent 機構）を使い、参加者自身が
必要な agent を定義していく方式を採る。外部の SDK やフレームワークは前提にしない。

---

## 2. 設計原則

| # | 原則 | 説明 |
|---|------|------|
| P1 | **役割単一性** | 1 agent = 1 責任。複数 role を兼任しない（例: codegen と review は別 agent） |
| P2 | **read-only by default** | 探索・分析 agent（Explore / Plan 等）は Edit/Write を持たず、調査 report のみ返す |
| P3 | **構造化 report 出力** | Subagent の output は最終 text = caller への return value。要点を構造化して返す |
| P4 | **HITL 介入境界の明示** | 各 agent が「どの判断で人間に escalate するか」を宣言する（`definitions/hitl/`） |
| P5 | **pull model（引き出し型）** | Context を agent に push せず、agent が必要時に自分で Read する（司書モデル、`docs/concepts/context-funnel.md`） |
| P6 | **branch isolation** | Subagent dispatch 時は main thread の git context を汚染しない |
| P7 | **scope contract 遵守** | 着手前に CHANGE / NOT CHANGE / DIFF BUDGET を明示（`.claude/rules/scope-contract.md`） |

---

## 3. Role 分類タクソノミー（6 区分）

agent を機能で 6 区分に分類する。新 agent 追加時はいずれかに必ず属させる。

### 3.1 Orchestrator（司令塔）
タスク分解・dispatch を担当。実装はしない。例: `coordinator` / `*-controller`。

### 3.2 Implementer（実装者）
実コード・実 SSOT を produce する。例: `codegen` / `frontend` / `backend` / `database`。

### 3.3 Reviewer / QA（検証者）
他 agent / 人間の成果物を verify。produce はしない。例: `review` / `test` / `security-agent`。

### 3.4 Domain Specialist（専門家）
特定のツール / プラットフォーム / 業界に特化。例: `aws-agent`（AWS）/ `chat-*`（チャット連携）/
`jj-*`（VCS）。ドメイン接頭辞を付ける。

### 3.5 Guard / Gate（門番）
意思決定の境界で介入し、外部接続・破壊操作を制御。例: `hitl`（人間承認待ち）/
`intent-guard`（逸脱検出）。

### 3.6 Curator（整理係）
情報・知識・ワークスペースを整理。例: `learning-curator`（知識の整理）/ `janitor`（古い成果物の掃除）。
Context Funnel（`docs/concepts/context-funnel.md`）の司書はこの区分に当たる。

---

## 4. サブエージェント 推奨最小集合

新しく agent システムを組むときの出発点。まずは少数から始め、必要になったら足す。

| 運用モデル | 最小集合 | 拡張候補 |
|-----------|----------|----------|
| 専属型（受託・顧問） | `coordinator` / `codegen` / `review` | `+ issue` / `+ pr`（起票・PR 自動化時） |
| 製品型（プロダクト） | `coordinator` / `codegen` / `review` / `frontend` / `backend` | `+ qa` / `+ design-reviewer` |
| ハイブリッド | 上記の重複を除いた合併集合 | 段階的に追加 |

Guard / Curator は Orchestrator（`coordinator`）が必要時に dispatch する。運用モデルの選び方は
`docs/templates/path-selector.md` を参照。

---

## 5. Agent エントリ skeleton

各社 `AGENTS.md` に記載する 1 entry の最小テンプレ:

```markdown
### {agent-name}

| 属性 | 値 |
|------|------|
| 分類 | Orchestrator / Implementer / Reviewer-QA / Domain-Specialist / Guard-Gate / Curator |
| 役割 | (1 文で要約) |
| 利用 tool | (Read / Edit / Write / Bash / Agent 等) |
| HITL trigger | (この agent が人間 escalate する判断条件。definitions/hitl/ と対応) |
| 命名規約 | kebab-case（例: `code-gen-agent`） |
```

### Sample entry

```markdown
### codegen

| 属性 | 値 |
|------|------|
| 分類 | Implementer |
| 役割 | コード生成・編集 |
| 利用 tool | Read / Edit / Write / Bash |
| HITL trigger | 破壊的な migration / schema 変更を検出したら承認ゲートへ |
| 命名規約 | kebab-case（codegen） |
```

---

## 6. 命名規約

| 規約 | 詳細 |
|------|------|
| **推奨**: kebab-case | 新規 agent は `code-gen-agent` / `review-agent` 形式 |
| 接頭辞 | ドメイン特化は domain prefix: `aws-*`, `db-*`, `jj-*` |
| 接尾辞 | guard は `-guard`, orchestrator は `-orchestrator`, controller は `-controller` |
| 重複禁止 | 同じ責務の agent を別名で二重定義しない（最終的に 1 つに統合） |
| 日本語愛称 | 任意（必須ではない） |

---

## 7. テンプレ側と実装側の関係

| 区分 | 配置 | 内容 |
|------|------|------|
| **テンプレ側**（本ファイル） | `docs/templates/AGENTS-template.md` | 抽象原則・分類・命名規約・skeleton |
| **実装側**（各社 root） | `<repo-root>/AGENTS.md` | 具体 agent 一覧（本テンプレに沿って自作） |

新会社で導入する場合:
1. 本テンプレを Read し、設計原則を理解する
2. `AGENTS.md` を repo root に新規作成する（空から始めて段階追加）
3. 追加 agent ごとに §5 skeleton を埋める
4. role 分類（§3）のいずれかに必ず属させる

---

## 8. 関連

- `docs/templates/README-template.md`（同梱テンプレ案内）
- `docs/templates/onboarding-checklist.md`（新会社セットアップ手順）
- `docs/templates/path-selector.md`（運用モデル選択ガイド）
- `docs/concepts/context-funnel.md`（司書モデル / pull model）

---

*AGENTS Template*
