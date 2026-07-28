# definitions/cycles/ — 業務サイクル計画

チーム/部門の業務サイクル（週次・月次・日次）の刻みと、各フェーズの活動・承認ゲートを
宣言する場所です。KPI（`kpi/`）と振り返り（`retro/`）がこのサイクルを基準に回ります。

## 生成のしかた

`docs/templates/cycle-plan-template.yaml` を本ディレクトリにコピーし、
`<team>-cycle-plan.yaml`（例: `ec-team-cycle-plan.yaml`）として記入します。

- `cycle_unit` を `monthly` / `weekly` / `daily` から選ぶ（月締めが本質なら monthly、受注速度が速いなら weekly）。
- `cycle_phases` は 3〜4 フェーズを推奨。各フェーズに `day_range` / `activities` / `hitl_gates` を書く。
- 共通 2 KPI に加え、チーム固有の指標を metrics に足す。
- `<<TODO_*>>` を全て埋め、`team_id` でチームを明示する。

## 記入時の約束

- サイクルのアンカー（週末セール・月初締め等）を `cycle_calendar` に明示する。
- 承認ゲート（`hitl_gates`）は `definitions/hitl/` のトリガーと整合させる。

記入済みの例: `examples/harukaze-ec/definitions/cycles/ec-team-cycle-plan.yaml`
