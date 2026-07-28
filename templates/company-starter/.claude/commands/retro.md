---
name: retro
description: 振り返りを対話的に実施し docs/retros/YYYY-MM-DD-retro.md に保存する（Phase 5: 記録）
---

# /retro

`docs/templates/retrospective-template.yaml` の構造（Keep / Problem / Try）を軽量に借りて、
今回のサイクル・セッションの振り返りを行います。

## 進め方

1. `docs/templates/retrospective-template.yaml` が存在すれば Read で目を通し、KPT の考え方
   （Keep / Problem / Try）を把握する。存在しなくても以下の対話は進められる。
2. ユーザーに以下を対話的に質問する（1 つずつ）:
   - **Keep（続けたいこと）**: 今回うまくいったパターン、次も続けたい進め方は何ですか？
   - **Problem（問題）**: 詰まった点、想定外だったこと、非効率だった部分は何ですか？
   - **Try（次に試すこと）**: 次のサイクルで試したい改善アクションを 1-3 個挙げてください。
3. 今日の日付を取得し、`docs/retros/<YYYY-MM-DD>-retro.md` に以下の形式で保存する（frontmatter は
   `docs/decisions/2026-07-03-obsidian-context-stock.md` §3 の L2 共通スキーマに準拠。
   `team_id` は対象チームが定まっていれば `definitions/` の team_id と一致させ、無ければ省略する）:

   ```markdown
   ---
   type: retro
   status: active
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   ---

   # Retro <YYYY-MM-DD>

   ## Keep

   - <ユーザーの回答>

   ## Problem

   - <ユーザーの回答>

   ## Try

   - <ユーザーの回答>

   ## Next actions

   - [ ] <Try から具体的なアクションに落とし込んだもの。owner と目安期日があれば併記>
   ```

4. `docs/retros/` ディレクトリが無ければ作成してから保存する。
5. 保存後、内容を要約してユーザーに提示する。「Next actions」に落とし込めそうな Try 項目が
   あれば、`/create-epic` や通常の Issue 起票に繋げることを提案する。

## 注意事項

- 振り返りは正直さが価値。うまくいった風に取り繕わず、Problem を率直に書く。
- Try に挙げた項目のうち重要なものは、次のセッション開始時（`/handoff` で作った HANDOFF.md の
  「Next up」）に反映されているか確認するとサイクルが繋がる。
- 既存の retro ファイル（frontmatter を持たないもの）は遡及的に一括改変しない。
  新規作成分から本スキーマを適用する。
