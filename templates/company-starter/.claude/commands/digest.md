---
name: digest
description: notes/ と docs/decisions/・docs/retros/ の frontmatter を集計し、オーナー向け週次ダイジェストを notes/company/digests/ に生成する（週次 / 随時）
---

# /digest

`docs/decisions/2026-07-03-obsidian-context-stock.md`（Decision RFC）§C の判断どおり、
Dataview / Bases のようなアプリ依存の集計クエリはストック内で禁止されています
（偽緑禁止 — 「表示されているように見える」と「検証済み」の混同を防ぐため）。
本コマンドはその代替として、**エージェントが実際に走査・集計した結果を plain Markdown で
生成**します。生成物はあくまで集計結果であり、SSOT ではありません。

## 進め方

1. 集計対象期間を決める。デフォルトは「直近 7 日間」（今日から遡って 6 日前まで）。
   ユーザーが期間を指定した場合はそれに従う。
2. 以下を Grep / Glob で走査し、frontmatter の `created:` / `updated:` が対象期間内のノートを集める:
   - `notes/company/**/*.md`（`digests/` 配下は集計対象から除外— 自己参照を避ける）
   - `notes/market/**/*.md`
   - `notes/clients/**/*.md`
   - `notes/sops/**/*.md`
   - `docs/decisions/*.md`
   - `docs/retros/*.md`
3. `notes/inbox/` を Glob し、`README.md` を除く未処理ノート件数を数える（`/ingest-context inbox`
   で処理される前のもの）。7 日超のファイルがあれば個別に列挙する（STOCK-03 相当の素朴な警告。
   `scripts/verify.py` への機械検証としての正式な組み込みは Phase C の課題）。
4. `notes/market/**/*.md` の `observed_at:` を確認し、今日から 90 日を超えているものを列挙する
   （STOCK-05 相当の素朴な鮮度警告。同じく RQT 化は Phase C の課題で、本コマンドは先行して
   日付比較だけを行う）。
5. 今日の日付を取得し、以下のテンプレートで `notes/company/digests/<YYYY-MM-DD>-digest.md` に Write する:

   ```markdown
   ---
   type: digest
   status: active
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   ---

   > **本ファイルは集計結果であり SSOT ではありません。** 元データは `notes/` 各棚・
   > `docs/decisions/`・`docs/retros/` です。本ファイルを直接編集しないでください。

   # Digest <YYYY-MM-DD>（対象期間: <開始日> 〜 <終了日>）

   ## 新規・更新ノート

   ### company
   - <slug> — <タイトル>（<created または updated>）

   ### market
   - <slug> — <タイトル>（<created または updated>、observed_at: <日付>）

   ### clients
   - <client slug>/<topic> — <タイトル>（<created または updated>）

   ### sops
   - <slug> — <タイトル>（<created または updated>）

   ### decisions / retros
   - <ファイル名> — <タイトル>（<created または updated>）

   （該当なしの見出しは「なし」と明記し、見出しごと省略しない）

   ## inbox 未処理

   - 件数: <N>
   - 7 日超で滞留しているもの: <ファイル名の列挙、または「なし」>

   ## market 鮮度注意（observed_at 90 日超）

   - <slug>（observed_at: <日付>、<日数> 日経過）
   - 該当なしなら「なし」

   ## 次のアクション（提案）

   - <inbox 滞留があれば `/ingest-context inbox` の実行を提案>
   - <鮮度注意があれば該当ノートの `source` 再確認を提案>
   ```

6. `notes/company/digests/` が無ければ作成してから Write する。
7. 生成後、内容を要約してユーザーに提示する。

## 注意事項

- 集計はその場の Grep/Glob 結果に基づく。過去の digest を再集計・自動更新はしない
  （digest 自体も 1 スナップショットの記録として蓄積する）。
- `type: digest` は `.claude/rules/notes-touch.md` の frontmatter 共通スキーマの type 列挙に
  追加された値。RFC 本文（type 列挙）を更新する場合は別途 Decision の要否を検討する。
- 生成物に実名・実額を書き写さない（元ノートの frontmatter とタイトルのみを集計する）。
