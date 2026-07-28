# definitions/kpi/ — KPI 計測仕様

チーム/部門単位で「何を・どう測り・どの閾値で警告するか」を宣言する場所です。
特定のコンセプトに依存せず、どんなチームの KPI でも記述できます。

## 生成のしかた

`docs/templates/kpi-measurement-template.yaml` を本ディレクトリにコピーし、
`<team>-kpi.yaml`（例: `ec-team-kpi.yaml`）として記入します。

- `<<TODO_*>>` プレースホルダーを全て自社の値に置き換える。
- 共通 2 KPI（`cycle_completion_rate` / `hitl_intervention_rate`）は必須。
- チーム固有の KPI を 2 件以上追加（例: 転換率・リピート率・在庫回転・問い合わせ応答時間）。
- 通知手段は `github_label` / `manual` など、自社で運用できる任意の手段を指定する。

## 記入時の約束

- `team_id` でどのチームの KPI かを明示する（`docs/templates/` の雛形の一般化 placeholder）。
- 実績値は創作値ではなく実データを入れる（例が欲しいときは examples/ を見る）。

記入済みの例: `examples/harukaze-ec/definitions/kpi/ec-team-kpi.yaml`
