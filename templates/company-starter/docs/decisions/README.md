# docs/decisions/ — Decision RFC 置き場

意思決定の根拠を後から追跡できるよう、Decision RFC をここに置きます。
`/decision` コマンドが `docs/decisions/YYYY-MM-DD-<slug>.md` を生成します（`CLAUDE.md` Phase 5: 記録）。

- **命名規約**: `YYYY-MM-DD-<slug>.md`（`<slug>` は英数字とハイフンのみ、2-4 語）。
- **frontmatter**: `date` と `status`（`proposed` / `accepted` / `superseded`）を持ちます。
- 既存の Decision は上書きしません。内容が変わった場合は新ファイルを作り、旧ファイルの
  `status` を `superseded` に更新して新ファイルへの参照を残します。
