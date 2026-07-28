# HITL トリガー記法ガイド（starter ネイティブ schema）

`definitions/hitl/triggers/*.yaml` に置く 1 トリガー = 1 ファイルの書き方です。
思想の全体像は `.claude/rules/hitl-gate.md`（金額・契約・不可逆操作・公開・認証の 5 カテゴリ）を、
承認者が 1 人しかいない場合の縮退規則は `definitions/hitl/approver-registry.yaml` を参照してください。

このガイド自体（`_schema.md`）は検証・記入の対象外です。実トリガーは同じ階層に
`<slug>.yaml`（例: `large-deal.yaml`）として置きます。記入済みの例は
`examples/harukaze-ec/definitions/hitl/triggers/` にあります。

> **md 表と yaml の役割分担**: `.claude/rules/hitl-gate.md` §2 の表は判断原則の
> **カテゴリ一覧**（思想面の全体像）で、この `triggers/*.yaml` が個別トリガーの
> **運用上の SSOT**（機械検証の対象）です。トリガーを追加・変更するときは **yaml が正**で、
> `scripts/verify.py` の HITL-02 が検証するのも yaml 側です。md 表は代表例として必要に応じて
> 更新すれば十分で、yaml と 1:1 対応させる必要はありません（詳細は `definitions/hitl/README.md`）。

---

## 1. 必須キー

| キー | 型 | 説明 |
|------|----|----|
| `id` | string | トリガー識別子（`lowercase + ハイフン`。ファイル名と揃える。例: `large-deal`） |
| `name` | string | 人間可読名（例: 大口発注ゲート） |
| `severity` | enum | `critical` / `high` / `medium` のいずれか（§3 参照） |
| `fire_when` | list | 発火条件。各要素は「自然言語の説明」＋任意の「条件式」（§2） |
| `approver_role` | string | 承認者の役割名（`approver-registry.yaml` の役割と対応。実名は書かない） |
| `notify` | enum | 承認依頼の通知手段。`github_label` または `manual` の 2 択のみ（§4） |
| `on_timeout` | string | 承認が時間内に来なかったときの挙動（§5） |

> `scripts/verify.py` の HITL-02 は、記入済みトリガーについてこの 7 キーの存在を検証し、
> さらに `approver_role` が `approver-registry.yaml` の `role_assignments` に定義済みかを照合します。
> `<<TODO>>` が残る未記入雛形は INFO（検証保留）で、記入すると PASS/FAIL 判定に昇格します。

## 2. 任意キー

| キー | 型 | 説明 |
|------|----|----|
| `description` | string | このゲートが何を守るかの説明 |
| `notify_label` | string | `notify: github_label` のとき付与するラベル名（例: `hitl:large-deal`） |
| `examples` | list | 発火する具体例（人間可読） |
| `auto_proceed` | bool | 条件付き自動承認の可否。**既定は false**。`critical`/`high` では常に false（§3） |

## 3. severity と自動承認の原則

| severity | 使いどころ | 自動承認 |
|----------|-----------|---------|
| `critical` | 会社存続レベル（障害・顧客影響・データ損失・セキュリティ） | **禁止**（必ず人間承認） |
| `high` | 財務・契約・SSOT 骨格変更（大口発注・新規契約・新 entity type） | **禁止** |
| `medium` | 低リスクで速度が重要（定型 CS 対応・既存項目への軽微追加） | 条件付きで可（`auto_proceed: true` + 明示条件） |

> `critical` / `high` を `auto_proceed: true` にしてはいけません。速度のために承認を省く判断は
> `medium` に限ります（`approver-registry.yaml` の縮退規則と整合）。

## 4. notify（通知手段は 2 択のみ）

| 値 | 意味 | 使い方 |
|----|------|-------|
| `github_label` | 承認待ちの Issue にラベルを付けて非同期に承認を促す | 承認者が別作業中でも他タスクを止めない（`docs/concepts/hitl-async-approval.md`） |
| `manual` | 担当者へチャット/口頭で即時確認する | 緊急・対面が自然な場面 |

外部の承認 SaaS・メールカード等の backend は持ち込みません（plain Claude Code + GitHub のみで動く範囲）。

## 5. on_timeout（時間切れの挙動）

`approver-registry.yaml` の severity 別縮退規則に沿って書きます。代表的な値:

| 値 | 意味 | 使える severity |
|----|------|----------------|
| `re_notify` | 別手段で再通知（自動進行しない） | すべて |
| `hold_item_only` | 該当項目だけ保留し、他タスクは継続 | すべて（推奨） |
| `escalate` | 上位/代理の承認者に回す | すべて |
| `auto_approve_with_log` | ログを残して自動承認 | **`medium` のみ** |

> `critical` / `high` に `auto_approve_with_log` を書いてはいけません（§3 と同じ理由）。

---

## 6. 最小の書き方（骨格）

```yaml
version: 1
id: <slug>                      # ファイル名と揃える
name: <人間可読名>
severity: high                  # critical | high | medium
description: |
  このゲートが何を守るか。

fire_when:
  - when: "<自然言語の説明>"
    condition: "<任意の条件式（例: order.amount_band in [30k_100k, over_100k]）>"

approver_role: <役割名>          # approver-registry.yaml と対応
notify: github_label            # github_label | manual
notify_label: "hitl:<slug>"     # notify: github_label のとき
on_timeout: hold_item_only

auto_proceed: false             # critical/high は必ず false
examples:
  - "<発火する具体例 1>"
```

---

*ai-retreat-starter — HITL トリガー記法ガイド*
