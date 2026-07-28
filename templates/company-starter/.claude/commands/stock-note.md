---
name: stock-note
description: L2 ノート（company-note / market / client-note / sop）を対話的に起票し、正しい棚 + 正しい frontmatter で notes/ へ保存する（随時）
---

# /stock-note

`docs/decisions/2026-07-03-obsidian-context-stock.md`（Decision RFC）で設計した L2 記述層の
ノートを、棚と frontmatter を暗記しなくても起票できるようにする摩擦低減コマンドです。
`.claude/rules/notes-touch.md` の共通スキーマに従います。

`/decision`（decision）・`/retro`（retro）は既に専用コマンドがあるため、本コマンドは
`company-note` / `market` / `client-note` / `sop` の 4 type を対象とします。

## 進め方

1. ユーザーに **type** を質問する（1 つずつ、以下から選ばせる）:
   - `company-note` — 自社の物語（沿革・戦略メモ・経営方針の背景）
   - `market` — 他社情報（競合・市場・パートナー候補）。公開情報のみ
   - `client-note` — クライアントの随時メモ（商談メモ・議事録の非機密要旨）
   - `sop` — 業務手順（SOP）
2. **内容**を質問する（タイトル・本文の要点）。
3. type 別の追加質問:

   | type | 追加で聞くこと |
   |------|---------------|
   | `market` | `source:`（URL または「口頭」等）、`observed_at:`（情報がいつ時点のものか、絶対日付） |
   | `client-note` | 対象クライアントの slug、トピック（ファイル名に使う）。slug は `definitions/clients/<slug>/` と一致させる |
   | `sop` | `team_id:`（`definitions/` の team_id と一致させる）、関連する skill があれば `related_skill:` |
   | `company-note` | 追加質問なし |

4. `client-note` の場合、`definitions/clients/<slug>/` が存在するか確認する:
   ```bash
   ls definitions/clients/<slug>/ 2>/dev/null
   ```
   存在しなければ「このクライアントは `definitions/` に未登録です。先に `/ingest-context` で
   構造情報として登録しますか、それともこのまま L2 メモとして残しますか？」とユーザーに確認する。
5. 今日の日付を取得し、type ごとの命名規則でファイルパスを決定する:

   | type | パス |
   |------|------|
   | `company-note` | `notes/company/<slug>.md` |
   | `market` | `notes/market/<slug>.md` |
   | `client-note` | `notes/clients/<client-slug>/<YYYY-MM-DD>-<topic>.md` |
   | `sop` | `notes/sops/<slug>.md` |

   `<slug>` / `<topic>` は内容から英数字とハイフンの短い slug を生成し、ユーザーに確認する。
6. 以下のテンプレートで Write する:

   ```markdown
   ---
   type: <type>
   status: draft
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   # --- type 別キー（該当するもののみ） ---
   client: <slug>            # client-note のみ
   source: <URL または口頭>   # market のみ
   observed_at: <YYYY-MM-DD>  # market のみ
   team_id: <id>              # sop のみ
   related_skill: <skill名>   # sop のみ・任意
   ---

   # <タイトル>

   <本文>
   ```

7. 生成後、内容とファイルパスを要約してユーザーに提示し、`status` を `draft` のままにするか
   `active` に確定するか確認する。

## 注意事項

- 既存の L2 ノートを上書きしない。追記・修正の依頼であれば Read してから Edit する。
- `notes/inbox/` にあるノートを棚へ昇格させたい場合は、本コマンドではなく
  `/ingest-context inbox`（`.claude/commands/ingest-context.md` §6）を使う
  （検疫を経由するため、そちらが正規経路）。
- 実名・実額・認証情報を本文に書こうとしていないか確認する（`.claude/rules/notes-touch.md` §4）。
