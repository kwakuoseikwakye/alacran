---
name: define-company
description: 自社オントロジーを対話的に定義し、definitions/ontology/company.yaml を生成する（Phase 1: 定義）
---

# /define-company

あなたは今から、ユーザーの会社のオントロジー（事業構造の宣言的定義）を一緒に作ります。
`docs/templates/ontology-starter.yaml` を出発点として、`definitions/ontology/company.yaml` を生成してください。

## 進め方

1. `docs/templates/ontology-starter.yaml` を Read で読み、構造（customer / org / product の 3 domain、entities、attributes）を把握する。
2. `docs/templates/ontology-schema-reference.md` の「機密の扱い」（§2 entity の書き方 内）を確認する。
   実名・実額・連絡先・認証情報は attributes に直接書かず、金額は `amount_band` のようなバンド表現にし、
   機密そのものは `secrets/` 側に置くことを、生成前にユーザーへ一言伝える。書きぶりのイメージは
   `examples/harukaze-ec/definitions/ontology/company.yaml`（バンド表現・役職のみ記載の記入済み完成例）を参考にしてよい。
3. 以下の質問を **1 つずつ、順番に** ユーザーに投げる。まとめて全部聞かない。回答を踏まえて次の質問を調整してよい。
4. 全ての回答が揃ったら、テンプレートの構造を踏襲した `definitions/ontology/company.yaml` を Write で生成する。
5. 生成後、内容をユーザーに要約して見せ、修正したい箇所がないか確認する。

## 質問リスト

1. **事業ドメイン**: どんな問題を解決している会社ですか？（例: 「中小企業の労務手続きを代行する」「EC事業者の在庫最適化を支援する」）
2. **主要ステークホルダー**: 顧客・従業員・パートナーのうち、誰が事業の中心にいますか？ それぞれどんな役割ですか？
3. **コアバリューフロー**: インプット（何を受け取るか）→ 変換（何をするか）→ アウトプット（何を届けるか）を一文ずつ教えてください。
4. **現在最大のボトルネック**: 今いちばん時間がかかっている、または属人化している業務は何ですか？

## 出力形式

`definitions/ontology/company.yaml` は以下の構造にする（`docs/templates/ontology-starter.yaml` の customer / org / product 3 domain 構造を踏襲し、業種固有の entity を追記してよい）:

```yaml
version: 1
schema_version: "<今日の日付>-company"
template_origin: docs/templates/ontology-starter.yaml
status: draft

company_summary:
  name: <会社名>
  domain: <質問1の回答を要約>
  employee_count: <従業員数（正確な数が分からなければ概数）>
  primary_bottleneck: <質問4の回答を要約>

stakeholders:
  # 質問2（主要ステークホルダー）の回答を役割ごとに列挙する
  - role: <例: 顧客企業の労務担当者>
    position: <依頼者 / 実務担当 / 意思決定者 など、事業内での立ち位置>

value_flow:
  # 質問3（コアバリューフロー）の回答をそのまま構造化する
  input: <何を受け取るか>
  transform: <何をするか>
  output: <何を届けるか>

customer:
  # ... ontology-starter.yaml の customer domain を実データで埋める

org:
  # ... 同上 org domain

product:
  # ... 同上 product domain
```

## 注意事項

- 業種固有の entity（例: 労務なら `labor_contract`、EC なら `sku`）は歓迎するが、テンプレート本体（`docs/templates/ontology-starter.yaml`）は編集しない。コピー先の `definitions/ontology/company.yaml` にのみ追記する。
- 外部パートナー（仕入先・広告媒体・提携先など）が事業の中心にいる業種では、customer / org / product の
  3 domain に加えて `partner` domain を追加してよい。
- 命名規約は `lowercase + ドット区切り`（例: `customer.account`）を踏襲する。
- 全ての質問に完璧に答えられなくても、暫定回答で `status: draft` として出力してよい。後で埋め直せることを伝える。
- ファイル生成後、`git add definitions/ontology/company.yaml` してよいか確認してからコミットする（コミット自体はユーザー確認後）。
