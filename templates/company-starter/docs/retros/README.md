# docs/retros/ — 振り返り記録の置き場

サイクル・セッションの振り返り（KPT: Keep / Problem / Try）をここに置きます。
`/retro` コマンドが `docs/retros/YYYY-MM-DD-retro.md` を生成します（`CLAUDE.md` Phase 5: 記録）。

- **命名規約**: `YYYY-MM-DD-retro.md`（単発の振り返り）または `<team-id>/weekly/<YYYY-Www>.md` `<team-id>/monthly/<YYYY-MM>.md`（サイクル運用時）。後者は `scripts/cycle/retro-render.py` の出力先と一致。
- **構成**: `Keep` / `Problem` / `Try` / `Next actions` の各セクション。サイクル運用の場合はさらに月次で `continue / extend / pivot / retire` の pivot 判定を追加。
- `Try` から生まれた改善アクションは、次セッション開始時に `HANDOFF.md` の「Next up」へ繋げます。

## 参考サンプル

- [`ec-team/weekly/2026-W27.md`](./ec-team/weekly/2026-W27.md) — 記入済み週次 retro の完成例（架空の EC 会社 Harukaze-EC）。元データは `examples/harukaze-ec/definitions/retro/ec-team-retrospective.yaml`。
