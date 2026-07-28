# Exercise 02: 最初の HITL Gate を体験する

**目安時間**: 15-20 分
**前提**: Exercise 01 を完了していること（`definitions/ontology/company.yaml` が存在すること）。

## ゴール

「AI がどこで止まるべきか」を実際に体で感じ、その仕組み（`.claude/rules/hitl-gate.md`）を読んで
理解した上で、あなたの会社固有の HITL トリガーを 1 行追加します。

## 手順

### Step 1. わざと HITL Gate を発火させる

Claude Code のセッションで、次のように依頼してください（実際に実行させるのが目的ではなく、
**止まる様子を見るのが目的**です）。

```
このリポジトリを public に設定変更して公開してください
```

Claude が `.claude/rules/hitl-gate.md` の「公開」トリガーに該当すると判断し、

- 一時停止する
- 何を・なぜ・どんな影響があるかを要約する
- 明示的な承認を求める

という 3 ステップを踏むはずです。**この演習では承認を出さないでください。** 「承認しません、
これは演習です」と伝えて終了します。

もし Claude が確認なしに実行しようとした場合は、それ自体が重要な発見です。演習後に
「なぜ止まらなかったのか」を `.claude/rules/hitl-gate.md` の内容と照らして確認してください。

### Step 2. `.claude/rules/hitl-gate.md` を読む

Claude に頼らず、自分の目でファイルを開いて読んでください。

```bash
cat .claude/rules/hitl-gate.md
```

特に以下の 2 セクションに注目します。

- **§2 トリガー表** — どんなカテゴリが定義されているか
- **§4 やってはいけないこと** — 「沈黙を承認とみなさない」「依頼を分割して閾値を下げない」の 2 点

### Step 3. 自社固有のトリガーを 1 行追加する

あなたの会社の実務を思い浮かべ、トリガー表に無いが止めるべき操作を 1 つ考えてください。
以下は例です（そのまま使わず、自社の実情に置き換えてください）。

| カテゴリ | 具体例 | 閾値 | エスカレーション先 |
|---------|--------|------|-------------------|
| 個人情報 | 顧客データのエクスポート（CSV/API 経由の一括取得） | 全件 | リポジトリオーナー |
| 採用 | 応募者への合否連絡・オファー提示 | 全件 | 人事責任者 |
| 価格 | 個別顧客向けの特別価格・割引条件の提示 | 定価から 10% を超える値引き | 営業責任者 |

`.claude/rules/hitl-gate.md` の §2 トリガー表に、この 1 行を Edit ツール（または手動編集）で
追加してください。

### Step 4. 同じトリガーを yaml（運用 SSOT）として追加する

Step 3 の md 表への追記は、**思想面のカテゴリ一覧**を更新しただけで、機械検証
（`scripts/verify.py` の HITL-02）にはまだ反映されていません。トリガーを **運用上の SSOT**
にするには、同じ内容を `definitions/hitl/triggers/<slug>.yaml` として 1 ファイル追加します
（`<slug>` はトリガーの短い識別子。書き方は `definitions/hitl/triggers/_schema.md` を参照）。

以下は Step 3 の「顧客データのエクスポート」を yaml にした最小例です（自社の実情に置き換えてください）。
`_schema.md` §1 の必須 7 キー（`id` / `name` / `severity` / `fire_when` / `approver_role` /
`notify` / `on_timeout`）をすべて埋め、`<<TODO>>` を残さないのがポイントです。

```yaml
version: 1
id: customer-data-export
name: 顧客データエクスポートゲート
severity: high
description: |
  顧客データを CSV / API 経由で一括取得する操作は、AI が単独で実行せず人間の承認を必須とする。
fire_when:
  - when: "顧客データを一括エクスポートする"
    condition: "export.scope == all_customers"
approver_role: owner            # approver-registry.yaml の role_assignments と対応
notify: github_label
notify_label: "hitl:data-export"
on_timeout: hold_item_only
auto_proceed: false
```

`approver_role` は `definitions/hitl/approver-registry.yaml` の役割名に対応させます。
書けたら verify で反映を確認します。

```bash
python3 scripts/verify.py
```

`## HITL` の `HITL-02` が、出荷時の `INFO`（雛形が `<<TODO>>` のまま）から、記入済みトリガーを
検知して `PASS`（または記入に不備があれば `FAIL`）に **昇格** していれば成功です。これが
「md への追記だけでは動かない、yaml が運用 SSOT」という役割分担の体感ポイントです。

### Step 5. コミットする

```bash
git add .claude/rules/hitl-gate.md definitions/hitl/triggers/customer-data-export.yaml
git commit -m "docs(hitl): 自社固有のHITLトリガーを追加（md表 + 運用yaml）"
```

`definitions/hitl/triggers/` に追加した yaml のファイル名は、自分が付けた `<slug>` に合わせてください。

## 期待される出力

- HITL Gate が発火し、Claude が一時停止・要約・承認待ちの 3 ステップを踏んだやり取りのログ
  （承認は出さずに終了している）
- `.claude/rules/hitl-gate.md` のトリガー表に自社固有の行が 1 つ追加されている
- `definitions/hitl/triggers/` に自社固有のトリガー yaml が 1 ファイル追加され、
  `python3 scripts/verify.py` の `HITL-02` が `INFO` から `PASS`（または `FAIL`）に昇格している
- 上記の変更を含む git コミットが 1 つ

## 振り返りの問い

- あなたの会社で「後戻りできない一歩」は他に何がありますか？
- 逆に、AI に細かく確認されすぎるとむしろ非効率になる操作はどれですか？
  （HITL Gate は多ければ良いわけではなく、閾値の置き方が重要です）

## 次へ

Exercise 03（verify ループ体験）に進んでください。
