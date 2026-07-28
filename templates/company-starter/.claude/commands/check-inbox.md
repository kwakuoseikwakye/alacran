---
name: check-inbox
description: 接続済みの Google アカウント（gog CLI）で未読メールを確認し、要約を notes/company/email-checks/ に生成する（読み取り専用 — 送信・既読化・ラベル変更・アーカイブはしない）
---

# /check-inbox

接続済みの Google アカウント経由で受信トレイの未読メールを確認し、要約レポートを生成する。
**読み取り専用**: メールの送信・既読化・ラベル変更・アーカイブは一切しない。

前提: `gog` CLI が認証済みであること（未接続なら `api-connect` スキルで Google アカウントを繋ぐ）。

## 進め方

1. 未読メールを取得する:

   ```
   gog -a auto gmail search "is:unread" --plain --max 20
   ```

   1行目はヘッダ、2行目以降が結果（タブ区切り: ID, DATE, FROM, SUBJECT, LABELS, THREAD）。
   結果行が無ければ「未読メールなし」と書いて終了する。

2. 各メッセージの詳細をメタデータのみ取得する（ID ごとに1回、本文は取得しない）:

   ```
   gog -a auto gmail get <ID> --format metadata --headers From,Subject,Date --plain
   ```

3. 今日の日付で `notes/company/email-checks/<YYYY-MM-DD>-inbox-check.md` に要約を Write する
   （`notes/company/email-checks/` が無ければ先に作成）:

   ```markdown
   ---
   type: inbox-check
   status: active
   created: <YYYY-MM-DD>
   tags: []
   ---

   > 本ファイルは受信トレイの読み取り専用スナップショットです。

   # Inbox check <YYYY-MM-DD>（未読 <件数> 件）

   ## 未読メール
   - <FROM> — <SUBJECT>（<DATE>）

   ## 気づき / 対応が要りそうなもの
   - <差出人・件名から返信や対応が要りそうなものがあれば 1-2 行。無ければ「なし」>
   ```

## 鉄則

- **読み取り専用。** `gog gmail send` / `gog gmail messages modify` は絶対に呼ばない。
- メール本文・トークン・個人情報を要約に転記しない（差出人名・件名・日付のみ）。
- 上記2つの gog コマンド（search と get）以外は実行しない。ファイルを1つ書いたら終了する。
