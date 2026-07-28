# definitions/ontology/ — 事業構造の定義

会社の事業構造（顧客 / 組織 / 製品の 3 ドメイン）を宣言的に記述する場所です。
ここが埋まると、以降の KPI・サイクル・振り返りが「何についての指標か」を参照できるようになります。

## 生成のしかた

- **対話生成（推奨）**: `/define-company` コマンドを実行すると、質問に答える形で
  `definitions/ontology/company.yaml` が生成されます。
- **手動記入**: `docs/templates/ontology-starter.yaml` を本ディレクトリに
  `company.yaml` としてコピーし、customer / org / product の各ドメインを自社の実データで埋めます。
  業種固有の entity（例: EC なら `sku` / `order`）は `company.yaml` にのみ追記し、雛形本体は編集しません。

## 記入時の約束

- 命名規約は `lowercase + ドット区切り`（例: `customer.account`）。
- entity や attribute を追加・削除したら `schema_version` を今日の日付に更新する
  （詳細は `.claude/rules/definitions-touch.md`）。
- 顧客の実名・個人情報は書かない（id 参照に留め、実データは別管理）。

記入済みの例: `examples/harukaze-ec/definitions/ontology/company.yaml`
