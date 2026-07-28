# state/ — 業務サイクルログの git 追跡置き場

`scripts/cycle/` の運用スクリプトが書き出す、チーム単位の永続ログを置く場所です。
`.gitignore` 対象の一時ファイル（`.env` やキャッシュ等）とは違い、**ここは git 追跡下の SSOT** です。
サイクルの実行記録・KPI スナップショット・セッション引き継ぎダイジェストを、後から
KPI 計測（`definitions/kpi/`）や振り返り（`definitions/retro/`）が集計できる形で残します。

> 合宿演習の必須範囲ではありません（`scripts/cycle/` は advanced 扱い）。まずは空のまま出荷し、
> サイクル運用を回し始めたチームだけが中身を育てます。

## レイアウト（team-id 単位）

```
state/
├── README.md                                  # 本ファイル
├── cycles/
│   └── <team-id>/                             # 例: ec-team
│       └── <YYYY-MM-DD>/                      # サイクル開始日（週次なら月曜）
│           ├── cycle.jsonl                    # 1 行 1 イベント（cycle-event.sh が追記）
│           └── kpi.json                       # KPI スナップショット（cycle-kpi-snapshot.py が生成）
└── handoff/
    └── <team-id>/
        ├── <YYYY-Www>.jsonl                   # 週次の引き継ぎダイジェスト（session-handoff.py が追記）
        └── latest.jsonl                       # 直近 1 件
```

## 何が入るか

| パス | 生成物 | 生成スクリプト | canonical schema |
|------|--------|----------------|------------------|
| `cycles/<team-id>/<YYYY-MM-DD>/cycle.jsonl` | サイクル実行ログ（append-only） | `cycle-event.sh` | `docs/templates/cycle-execution-log-schema.yaml` |
| `cycles/<team-id>/<YYYY-MM-DD>/kpi.json` | 共通 2 KPI スナップショット | `cycle-kpi-snapshot.py` | 上と同じログを集計 |
| `handoff/<team-id>/<YYYY-Www>.jsonl` | セッション引き継ぎダイジェスト | `session-handoff.py` | — |

## 運用メモ

- **git 追跡対象**: サイクルログは会社の記録なのでコミットして残します（履歴として全期間保持）。
- **team-id**: `definitions/ontology/company.yaml` の `org.team` の team_id（例: `ec-team`）を使います。
- **機密は入れない**: 実名・実額・認証情報はここに書かないでください（`.claude/rules/definitions-touch.md` の PII 方針に準じ、機密は `secrets/` へ）。
- **記入済みの完成例**: `examples/harukaze-ec/definitions/kpi/ec-team-kpi.yaml` が、この `state/cycles/ec-team/...` を data_source として参照する例です。

---

*ai-retreat-starter — state/ 業務サイクルログ置き場*
