---
name: handoff
description: HANDOFF.md を更新し、直近のセッション内容を棚卸ししてセッション引き継ぎ情報を残す（Phase 5: 記録）
---

# /handoff

セッション終了時に `HANDOFF.md`（repo root）を更新し、次に着手する人（未来の自分を含む）が
迷わないようにします。`CLAUDE.md` §2.6「セッション引き継ぎ」原則を実践するコマンドです。

## 進め方

1. `HANDOFF.md` が存在すれば Read で読み、直近セクションを把握する。存在しなければ新規作成する。
2. 自動収集のため以下を実行する:
   ```bash
   git log --since='24 hours ago' --oneline
   gh issue list --state open --limit 10
   ls notes/inbox/*.md 2>/dev/null | grep -v README.md   # 未処理ノートの棚卸し（notes/ 未導入なら空）
   ```
   `notes/inbox/` に未処理ノートが残っていれば、「Next up」に
   `/ingest-context inbox` での処理を候補として挙げる（詳細は `.claude/commands/ingest-context.md` §6）。
   `gh` が使えない・リモート未設定の環境では、フォールバックとして以下を使う:
   ```bash
   git log --since='24 hours ago' --oneline   # Done today の棚卸しはこれで代替できる
   ```
   Issue 状態の確認はスキップし、後述の「Blockers」に「gh 未接続のため Issue 状態未確認」と
   明記する。ネットワーク回復後、次回セッションで `gh issue list` を実行して埋め合わせる。
3. 収集結果を材料に、今日の日付でセクションを追記する（既存内容は上書きせず、末尾に追記）。
   **同日に複数回セッションを行った場合**は見出しを重複させず、`## <YYYY-MM-DD> (2回目)` の
   ように回数サフィックス（または `## <YYYY-MM-DD> 15:00` のような時刻併記）で区別する:

   ```markdown
   ## <YYYY-MM-DD>

   ### Done today
   - <git log の要約。コミットハッシュ + 概要>

   ### In flight
   - <着手済みだが未完了の作業。Issue番号があれば併記>

   ### Next up
   - <次にやるべきこと。優先度順>

   ### Blockers
   - <詰まっている点。無ければ「なし」>

   ---
   ```

4. **ローテーション**: 追記後、日付見出し（`## ` で始まるセッションセクション）が
   **5 を超えたら**、古い方から超過分を `docs/handoffs/<YYYY-MM>.md`
   （そのセッション日付の月）へ**移動**する（削除ではなく移動 — 経緯の追跡可能性を保つ）。
   アーカイブファイルが無ければ見出し `# HANDOFF アーカイブ <YYYY-MM>` で新規作成し、
   セクションは時系列順に追記する。移動後、`HANDOFF.md` 冒頭の説明はそのまま。
   詳細な運用ルールは `docs/handoffs/README.md` を参照。
5. `gh issue list --state open` の結果を突き合わせ、「Next up」に反映すべき Issue がないか確認する。
6. 「Done today」「In flight」「Next up」は git log / issue list から自動でドラフトを作成してよいが、
   **「Blockers」は必ずユーザーに確認する**。ここは自動収集できない情報なので、埋めずに空欄のまま
   コミットしない。自律実行（ユーザー不在）でヒアリングできない場合は、空欄や無根拠の「なし」では
   なく「なし（自律セッションのため未ヒアリング。相違があれば修正してください）」のように未確認で
   あることを明記し、次セッションの人間確認を促す。

## 最後に

- ドラフトをユーザーに提示し、以下のチェックリストで確認を取る:
  - [ ] Done today は今日の作業を過不足なく反映しているか
  - [ ] In flight に未完了タスクが漏れていないか
  - [ ] Next up の優先順位は正しいか
  - [ ] Blockers に該当する詰まりどころが正確に書かれているか
- 確認が取れたら `HANDOFF.md` を Write で更新する。
- コミットするかどうかはユーザーに確認してから行う（無断でコミットしない）。
