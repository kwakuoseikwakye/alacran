# definitions/retro/ — 振り返りの型

サイクルごとの振り返り（KPT: Keep / Problem / Try）と、続けるか見直すかの判定
（continue / extend / pivot / retire）の型を宣言する場所です。

## 生成のしかた

`docs/templates/retrospective-template.yaml` を本ディレクトリにコピーし、
`<team>-retrospective.yaml`（例: `ec-team-retrospective.yaml`）として記入します。

- `weekly_retrospective` / `monthly_retrospective` のうち、サイクル単位に合う方を必須で埋める。
- KPT の 3 節（keep / problem / try）を残す。
- 月次の pivot 判定は continue / extend / pivot / retire の 4 区分で書く。
- `<<TODO_*>>` を全て埋め、`team_id` でチームを明示する。

## 記入時の約束

- 振り返りの成果（Decision 候補）は `docs/decisions/`（`/decision` で生成）へ昇格させる。
- 振り返り記録そのものは `docs/retros/` に置く（`/retro` コマンドが補助）。

記入済みの例: `examples/harukaze-ec/definitions/retro/ec-team-retrospective.yaml`
