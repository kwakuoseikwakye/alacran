<!--
=============================================================================
週次振り返りテンプレート（retro-weekly.md）— チーム単位の汎用フォーマット
=============================================================================
scripts/cycle/retro-render.py の DEFAULT_TEMPLATE です。render は cycle.jsonl +
kpi.json（cycle-kpi-snapshot.py 生成）を読み、下記の {…} プレースホルダのうち
「識別情報」と「KPI ダッシュボードの共通 2 KPI」だけを自動で埋めます。
KPT / 保留判断 / 次サイクルアクションは、振り返りの場で人間が記入する欄なので
自動では触りません（そのまま残ります）。

生成先: docs/retros/<team-id>/weekly/{YYYY-Www}.md
設計リファレンス: docs/templates/common-retro-pattern.yaml（KPT + pivot 判定の型）
=============================================================================
-->

# 週次振り返り — {TEAM_ID} — {WEEK_LABEL}（{CYCLE_START} → {CYCLE_END}）

> **サイクル ID**: {CYCLE_ID}
> **ファシリテーター**: （記入：振り返りの進行役）
> **生成時刻**: {GENERATED_AT}

---

## 1. KPI ダッシュボード

> 共通 2 KPI は cycle.jsonl から自動集計しています。
> 目標値（target）は自社の `definitions/kpi/<team>-kpi.yaml` が正です。ここでの
> 判定は汎用のデフォルト目安（完了率 >= 95% / 承認介入率 <= 35%）で付けているので、
> 自社目標と照合して読み替えてください。

| KPI | 説明 | 実績 | 判定 |
|-----|------|------|------|
| cycle_completion_rate | サイクル完了率（cycle_completed / cycle_started） | {ACTUAL_CCR} | {STATUS_CCR} |
| hitl_intervention_rate | 人間承認介入率（hitl_gate_fired / task_executed） | {ACTUAL_HIR} | {STATUS_HIR} |

**このサイクルの閾値アラート**: {ALERT_SUMMARY}

> チーム固有 KPI（転換率・応答時間など）は外部データソースが要るため自動集計対象外です。
> `definitions/kpi/<team>-kpi.yaml` の各 KPI を、それぞれの data_source から集計して下の表に追記してください。

| チーム固有 KPI | 目標 | 実績 | 判定 |
|----------------|------|------|------|
| （記入） | （記入） | （記入） | （記入） |

---

## 2. KPT（Keep / Problem / Try）

### Keep（今サイクルで機能した・続けたいこと）

- （記入）

### Problem（閾値超過・観察された摩擦・詰まり）

- （記入）

### Try（次サイクルで試す改善：1〜3 件）

- [ ] （記入）

---

## 3. 保留中の意思決定

> サイクル中に保留した判断を書き出します（title / 提起日 / blocker / 解決予定サイクル）。
> 解決したものは `docs/decisions/` の Decision RFC に昇格させます。

| タイトル | 提起日 | blocker | 解決予定サイクル |
|----------|--------|---------|------------------|
| （記入） | （記入） | （記入） | （記入） |

---

## 4. 次サイクルのアクション

> Try と保留判断の解決期限から、担当・期限つきの TODO を作ります。

- [ ] （記入：担当 / 期限）

---

*ai-retreat-starter — 週次振り返りテンプレート（retro-weekly.md）*
