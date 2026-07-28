---
name: ingest-context
description: 外部資料・URL・テキストを検疫してから definitions/ の正しい棚へ安全に取り込む（Phase 1: 定義）
---

# /ingest-context

会社の資料・URL・テキストを受け取り、**機密を検疫してから** `definitions/` の
正しい棚へ整形して取り込みます。いきなり本棚に流し込まず、下書き置き場
（`definitions/.staging/`、gitignore 対象）を経由する「2 相書き込み」で、
機密混入と棚の無秩序化を防ぎます。考え方は `docs/concepts/context-funnel.md`。

notes/inbox/ に溜まった未処理ノート（オーナーが自由記述したメモ）を検疫し、L1（`definitions/`）
または L2（`notes/` の棚）へ昇格させる用途にも使えます（inbox モード、§6 参照）。

## 使い方

```
/ingest-context <資料のパス / URL / 貼り付けたテキスト>   # 通常モード
/ingest-context inbox                                      # inbox モード（notes/inbox/ を一括処理）
```

## 進め方（受領 → 検疫 → 分類 → 格納）

### 1. 受領（Intake）

- 受け取った資料・URL・テキストを、まず `definitions/.staging/` に一時ファイルとして保存する
  （ディレクトリが無ければ作る。`.gitignore` 対象なので生データはここまで）。
- URL の場合は要点を抜き出してテキスト化し、同じく `.staging/` に置く。

### 2. 検疫（Quarantine）— 機密スキャン

- 保存した内容に以下が混ざっていないかスキャンする:
  - 認証情報（API キー・トークン・パスワード・秘密鍵）
  - 実名の契約金額・単価（桁のバンドではなく実額）
  - 個人情報（氏名・メール・電話番号・住所）
  - 未公開の事業情報（新商品・キャンペーン・業務提携・人事等、公表前の情報）
- **1 つでも見つかったら、そこで停止する**。ユーザーに「これは機密です。`secrets/`
  （`.gitignore` 対象）に置き、`definitions/` 側からは id で参照してください」と案内し、
  該当箇所を除いた版にしてから次へ進むか確認する。
- 判断に迷うものは `.claude/rules/hitl-gate.md` の「認証」「公開」トリガーに照らす。

### 3. 分類（Route）— どの棚か判定

- 内容が下記のどの棚に属するかを判定し、ユーザーに提案して確認を取る:

  | 棚 | 置くもの |
  |----|---------|
  | `definitions/ontology/` | 事業構造（顧客・組織・製品の entity/event/relation） |
  | `definitions/kpi/` | チーム単位の KPI 計測仕様 |
  | `definitions/hitl/` | 承認が要る操作のトリガー・承認者レジストリ |
  | `definitions/clients/<slug>/` | クライアントの非機密な構造情報 |

- どの棚にも当てはまらない場合は、無理に格納せず「保留」としてユーザーに相談する。

### 4. 格納（Store）

- 該当する棚の記法（各棚の README / `docs/templates/` の雛形）に整形して書き込む。
  - ontology なら `docs/templates/ontology-schema-reference.md` の記法に合わせる。
  - kpi / retro / cycle なら `docs/templates/*-template.yaml` の構造に合わせ、`team_id` を明示。
  - clients なら `docs/templates/` に雛形が無いため、`definitions/clients/README.md` の
    3 ファイル構成と `examples/harukaze-ec/definitions/clients/midori-hotel/` の完成例を
    参照して整形する。
- 書き込んだら `definitions/.staging/` の一時ファイルを掃除する。

### 5. 報告と引き継ぎ

- 何を・どの棚に・どう整形して入れたかを箇条書きで報告する。
- `git add` してよいか確認してからコミットする（コミットはユーザー確認後）。
- 続けて `/handoff` で `HANDOFF.md` に取り込み履歴を残すことを促す。

## 6. inbox モード（`notes/inbox/` → `notes/` 棚 または `definitions/`）

`docs/decisions/2026-07-03-obsidian-context-stock.md`（Decision RFC）§4/§6 の実装。
オーナーが `notes/inbox/` に自由記述したメモを、検疫してから正しい行き先へ昇格させます。
`notes/inbox/` は `.staging/` と異なり **git 追跡される**ため、「昇格 = 元ファイルを
`git mv` で inbox から出す」ことが昇格済みの印になります（別途マーカーは持たない）。

### 6.1 検出

- `notes/inbox/*.md`（`README.md` は対象外）を列挙する。
- 1 ファイルずつ処理する（複数ファイルを一括で棚に流し込まない。安全側）。

### 6.2 検疫

- 通常モードの 2 節と同じ基準でスキャンする。機密が見つかったら同様に停止し、
  `secrets/` への退避を案内する（inbox ファイルはそのまま残す。ユーザーが退避してから再実行）。

### 6.3 分類 — L1 か L2 か、L2 ならどの棚か

- **構造情報**（新規クライアント・KPI 変更・HITL トリガー追加等、事業構造そのものの変更）
  → 通常モード 3〜4 節の L1 ルーティングに従う。`.claude/rules/definitions-touch.md` の
  schema_version 判断も適用する。
- **物語・観察・手順**（それ以外）→ L2。RFC §2 の棚マップに沿って `type` を確定し、
  ユーザーに提案して確認を取る:

  | type | 棚 | 追加で要確認の frontmatter |
  |------|-----|---------------------------|
  | `company-note` | `notes/company/` | — |
  | `market` | `notes/market/<slug>.md` | `source:`（URL または「口頭」等）、`observed_at:`（情報の時点） |
  | `client-note` | `notes/clients/<client-slug>/YYYY-MM-DD-<topic>.md` | `client:`（`definitions/clients/<slug>/` と一致する slug。一致しなければ新規クライアントとして先に L1 側の確認を挟む） |
  | `sop` | `notes/sops/<slug>.md` | `team_id:`（`definitions/` の team_id と一致） |

- どちらとも判断がつかない場合は無理に昇格させず、ユーザーに相談してこのラウンドは
  inbox に残す。

### 6.4 格納

- `.claude/rules/notes-touch.md` の共通 frontmatter スキーマ（`type` / `status: active` /
  `created` / `updated` / `tags`）と、6.3 で確認した type 別キーを付与する。
  `created` は inbox ファイル名に日付が含まれていればそれを使い、無ければ今日の日付にする。
- 確認が取れたら `git mv notes/inbox/<file> <行き先>` で移動し、frontmatter を追記する
  （新規ファイルではなく移動なので、通常モードのような `.staging/` 経由の 2 相書き込みは不要）。
- L1 へのルーティングの場合は通常モード 4 節の格納手順に従う（この場合のみ、格納後に
  inbox の元ファイルを削除する）。

### 6.5 報告と引き継ぎ

- 処理したファイルごとに「どこから → どこへ → どの type で」昇格したかを箇条書きで報告する。
- `git add` してよいか確認してからコミットする（コミットはユーザー確認後、通常モードと同様）。
- `/handoff` で `HANDOFF.md` に inbox 処理状況（未処理件数・今回処理した件数）を残す。

## 注意事項

- `definitions/.staging/` は検査前の生データ置き場。検査を通ったものだけを `definitions/` の
  本棚へ昇格させる（相 1 → 相 2）。`.staging/` の中身はコミットしない。
- `notes/inbox/` は inbox モードにおける相 1 に相当するが、`.staging/` と異なり git 追跡される
  （`notes/inbox/README.md` 参照）。
- push 型で情報を配らない。棚を整えるだけの「司書」として振る舞い、エージェントには
  必要なときに自分で Read させる（pull モデル）。
- 機密が見つかったら黙って伏せず、必ずユーザーに知らせて `secrets/` への退避を案内する。
