---
date: 2026-07-03
type: template-package-readme
---

# 汎用テンプレート配布パッケージ

> オントロジー駆動の自律運営（SSOT の YAML/Markdown + HITL Gate + 業務サイクル）を
> **任意の会社** に展開するための雛形集。plain Claude Code + GitHub だけで動きます。

---

## 1. このテンプレで何ができるか

運用モデル中立で設計されており、どんな届け方にも適用できます:

- **専属型**（受託・顧問・常駐: 顧客ごとに深く入り込む）
- **製品型**（プロダクトを多数に低タッチで提供）
- **ハイブリッド**（専属で立ち上げ → 製品化してスケール）

業種・運用モデルを問わず、SSOT 駆動の自律運営を最小コストで立ち上げられます。
運用モデルの選び方は `docs/templates/path-selector.md`。

---

## 2. 同梱ファイル

| ファイル | 用途 | 編集要否 |
|---|---|---|
| `README-template.md` | このファイル（案内のみ） | 不要 |
| `onboarding-checklist.md` | 新会社セットアップ手順書 | 不要（実行手順書） |
| `path-selector.md` | 運用モデル選択ガイド | 不要（参照のみ） |
| `AGENTS-template.md` | Agent システム設計指針（原則 + role 6 分類 + skeleton） | 不要（参照のみ） |
| `ontology-starter.yaml` | 最小オントロジー（customer + org + product） | **必須**（会社情報を反映） |
| `ontology-schema-reference.md` | entity / event / relation の記法ガイド | 不要（参照のみ） |
| `kpi-measurement-template.yaml` | チーム単位の KPI 計測仕様の雛形 | 任意（KPI を回すなら） |
| `cycle-plan-template.yaml` | 業務サイクル計画の雛形 | 任意 |
| `retrospective-template.yaml` | 振り返り（KPT + pivot 判定）の雛形 | 任意 |
| `common-kpi-pattern.yaml` / `common-retro-pattern.yaml` | KPI・振り返りの共通骨格の解説 | 不要（参照のみ） |
| `cycle-execution-log-schema.yaml` | サイクルログ（cycle.jsonl）の schema | 不要（参照のみ） |

HITL トリガーの雛形は `definitions/hitl/triggers/`（`_schema.md` + `*.yaml`）にあります。

---

## 3. 推奨セットアップ順序

```
Step 1. path-selector.md を読む → 運用モデルを決める
Step 2. onboarding-checklist.md に沿って進める
Step 3. /define-company で definitions/ontology/company.yaml を作る
Step 4. 選んだモデルに応じて definitions/ の棚を記入する
Step 5. python3 scripts/verify.py で検証する
Step 6. HANDOFF.md に onboarding 履歴を追記する（/handoff）
```

詳細は `onboarding-checklist.md` を参照。

---

## 4. テンプレの設計原則

| 原則 | 説明 |
|---|---|
| **Pull Model 強制** | テンプレは Push しない。エージェントは必要時に CLAUDE.md / オントロジーを自分で Read する |
| **運用モデル中立** | 専属 / 製品 / ハイブリッドどれにも適用できる抽象を保つ |
| **最小開始** | 最小オントロジー 3 domain（customer/org/product）のみ用意。残りは必要時に追加 |
| **業種非依存** | 業種固有 entity（例: EC の sku）はテンプレに含めない。各社で追加 |

---

## 5. 記入前と記入後

- **記入前（配布直後）**: `definitions/` は README 付きの空の骨格。`docs/templates/` に雛形がある。
- **記入後**: `definitions/` 配下の各サブディレクトリ（ontology / kpi / cycles / retro / hitl / clients）に自社の実データが埋まる。
- **完成形の見本**: `examples/harukaze-ec/`（架空の EC 会社の記入済みフルセット。読むだけ）。

記入前/後のフォルダ構成の対比は `docs/directory-map.md` を参照。

---

## 6. 配布対象

| 対象 | 提供形態 |
|---|---|
| 社内別部門 | 本テンプレを "Use this template" で新規 private リポ作成 |
| 外部案件 | テンプレ部分のみ抜粋して納品物に同梱 |

---

## 7. 関連ドキュメント

- `CLAUDE.md` — 本テンプレの運用憲法（5-phase workflow + 6 原則 + コンテキスト地図）
- `docs/starter-manual.md` — 15 分セットアップから始める初心者ガイド
- `.claude/rules/scope-contract.md` / `issue-first.md` / `hitl-gate.md` — 3 大規律

---

*Template Distribution Package*
