# Exercise 01: 自社を定義する

**目安時間**: 20-30 分
**前提**: `claude` コマンドでこのリポジトリを開けること。`CLAUDE.md` を読み込んだ状態でセッションが始まっていること。

## ゴール

このリポジトリのオントロジー（事業構造の宣言的定義）テンプレートを使って、
**あなたの実際の会社**の customer / org / product を書き出します。
完了すると `definitions/ontology/company.yaml` があなたの会社を表すファイルになります。

## 手順

### Step 1. コマンドを実行する

Claude Code のセッションで以下を入力します。

```
/define-company
```

Claude が `docs/templates/ontology-starter.yaml` を読み込み、1 つずつ質問を投げてきます。
急いで全部答えようとせず、1 問ずつ対話しながら進めてください。

### Step 2. 質問に答える

4 つの質問に答えます。以下は回答例です（そのまま使わず、自社に置き換えてください）。

1. **事業ドメイン**（どんな問題を解決しているか）
   - 例:「中小企業の労務手続き（給与計算・社会保険手続き）を代行し、月次のミスと工数を削減する」
   - 例:「EC 事業者向けに、需要予測に基づく自動発注を提供し、欠品と過剰在庫を同時に減らす」

2. **主要ステークホルダー**（誰が事業の中心にいるか）
   - 例:「顧客企業の労務担当者（依頼者）、社労士本人（実務担当）、顧問先の経営者（意思決定者）」
   - 例:「EC 店長（発注判断者）、倉庫担当者（実作業者）、仕入先（外部パートナー）」

3. **コアバリューフロー**（インプット → 変換 → アウトプット）
   - 例:「勤怠データ（インプット）→ 給与計算・保険料算定（変換）→ 給与明細と納付書（アウトプット）」

4. **現在最大のボトルネック**（属人化・時間がかかっている業務）
   - 例:「月末の給与計算チェックが特定の担当者しかできず、毎月 2 日間かかっている」

### Step 3. 生成されたファイルを確認する

`definitions/ontology/company.yaml` が生成されたら、内容を読み、事実と違う点や
言葉が硬すぎる点があれば Claude に修正を依頼してください。曖昧なままでよい項目は
`status: draft` として残ります。無理に完璧を目指す必要はありません。

### Step 4. コミットする

```bash
git add definitions/ontology/company.yaml
git commit -m "docs(ontology): 自社オントロジーの初版を定義"
```

（このコミットは Issue-First の対象外 — 演習内の学習コミットとして扱ってよい）

## よくある間違い

1. **業種固有の話を `docs/templates/ontology-starter.yaml`（テンプレート本体）に直接書いてしまう**
   → テンプレート本体は編集しない。必ずコピー先の `definitions/ontology/company.yaml` に書く。
2. **抽象度がバラバラになる**（`customer.account` に会社名を、`customer.contact` に部署名だけを書く等）
   → `attributes` の型（string / enum / list 等）に沿って一貫性を保つ。迷ったら
   `examples/harukaze-ec/definitions/ontology/company.yaml`（記入済みの完成例）と見比べる。
3. **1 回で全部を完璧に埋めようとして止まってしまう**
   → 分からない項目は `<<TODO>>` や空欄のまま `status: draft` で保存してよい。
   後のセッションで埋め直せる。

## 期待される出力

- `definitions/ontology/company.yaml`（customer / org / product の 3 domain があなたの会社の
  実データで埋まっている、または `status: draft` で暫定値が入っている）
- 上記ファイルを含む git コミットが 1 つ

## 次へ

`definitions/ontology/company.yaml` ができたら、Exercise 02（HITL Gate 体験）に進んでください。
