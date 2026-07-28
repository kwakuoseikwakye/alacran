---
name: verify
description: scripts/verify.py を実行し、PASS/WARN/FAIL/INFO を解釈して修正案を提示する（Phase 4: 検証）
---

# /verify

`scripts/verify.py` を実行し、結果を読み解いてユーザーに要約してください。**偽緑禁止の原則に従い、
FAIL を隠したり、検証ロジック側を緩めて通そうとしたりしないこと。**

## 進め方

1. `scripts/verify.py` の存在を確認する。存在しなければ「Phase B-3 セットアップ未完了です。
   `scripts/verify.py` がまだこのリポジトリに存在しません」と伝え、それ以上の推測はしない
   （存在しないファイルの中身や欠落 RQT について憶測で語らない）。
2. 存在すれば以下を実行する:
   ```bash
   python3 scripts/verify.py
   ```
3. 出力を読み、`RQT ID` ごとに `PASS` / `WARN` / `FAIL` / `INFO` / `SKIP` を集計して要約する。
4. 終了コードが非 0（＝ FAIL が 1 件以上）の場合、FAIL した RQT ごとに原因と直し方を提示する。

## 出力ステータスの意味

| ステータス      | 意味                           | 対応                                        |
| --------------- | ------------------------------ | ------------------------------------------- |
| `PASS`          | 検証項目クリア                 | 何もしなくてよい                            |
| `WARN`          | 動くが望ましくない状態         | 余裕があれば直す                            |
| `FAIL`          | 検証項目が満たされていない     | 修正必須。偽緑禁止 — 検証を弱めて回避しない |
| `INFO` / `SKIP` | 対象がまだ存在しない・任意項目 | テンプレ育成の余地。今すぐ対応不要          |

## よくある FAIL カテゴリと修正案

- **`STRUCTURE-*` FAIL**（`LICENSE.md` / `CLAUDE.md` / `README.md` / `.gitignore` が無い、または
  `.gitignore` に `secrets/` `.env` の遮断が無い）
  → 該当ファイルが repo root に存在するか確認し、無ければ復元する。`.gitignore` は
  `secrets/` と `.env` の両方を含める必要がある。
- **`HYGIENE-01` FAIL**（`TODO(temp)` マーカーが 30 日以上放置）
  → 該当箇所を Grep で特定し、実装を完了させて `TODO(temp)` を除去するか、恒久 TODO に書き換える。
- **`ONTOLOGY-01` FAIL**（`definitions/ontology/*.yaml` の構文エラー）
  → エラーメッセージが示す yaml ファイルと行を確認し、インデント崩れやコロン抜けを直す。
- **`HITL-01` FAIL**（`.claude/rules/hitl-gate.md` はあるがトリガーテーブルが無い）
  → Markdown テーブル（`|` 区切り + `---` 区切り行）でトリガー表を追加する。
- **`HARNESS-01`/`HARNESS-02` FAIL**（`.claude/settings.json` の hook が存在しない・実行権限が無い・
  shebang が無い、またはサンプル入力実行時に非ゼロ終了する）
  → 該当 hook スクリプトのパスを確認し、`chmod +x` で実行権限を付与するか、1 行目に `#!` を追加する。
  スモークテストで FAIL した場合は該当 hook の stdin JSON 入力契約（Issue #26 参照）を見直す。
- **`META-01`/`META-02` WARN**（直近コミットの Issue 参照率・Conventional Commits 準拠率が
  閾値 80% 未満）
  → `META` は Issue-First（`.claude/rules/issue-first.md` §5）の遵守度を計測する初のメタ KPI で、
  FAIL ではなく WARN（非ブロッキング）として扱う。過去のコミットは書き換えられないため、
  以後のコミットで `#<Issue番号>` の参照を含めるか、オフライン時は `issue化予定` を残し、
  件名を `type(scope): description` の Conventional Commits 形式に揃えることで率を回復していく。
- **`META-03` WARN**（直近コミットのうち diff サイズが 500 行を超える「大きな変更」の比率が
  30% を超える）
  → `Scope Contract`（`.claude/rules/scope-contract.md` §3 の diff budget）の遵守度を計測する
  メタ KPI で、こちらも FAIL ではなく WARN（非ブロッキング）。過去のコミットは書き換えられないため、
  以後は大きな変更を子 Issue / 複数コミットに分割する（scope-contract.md §3「超過時の対応フロー」）
  ことで比率を回復していく。正当な複雑さで 1 コミットに留める場合は、コミットメッセージに理由を
  明記した上で進めてよい（§5 Bypass）。
- **`CONTEXT-01` FAIL の直し方**（常駐コンテキスト予算超過、または `@` import 切れ）
  → CLAUDE.md 本文を痩せさせ、詳細は docs/ 配下へ追い出す。ツリー図や対応表は
  directory-map.md 等に委譲する。import 切れはパスを直す。

## 注意事項

- `scripts/verify.py` 自体を「通すために」書き換えることは禁止（偽緑禁止の原則、`CLAUDE.md` §2.5）。
  直すのは検証対象の実装・設定ファイル側。
- RQT を独自に追加したい場合は `scripts/verify.py` に `verify_*()` 関数を足し、`main()` の呼び出し
  リストにも追記するよう案内する（`exercises/03-run-verify-loop.md` 参照）。
- 存在しない RQT カテゴリや未実装の検証について、ユーザーに聞かれてもいないのに憶測で補って
  説明しない。出力に無いものは無いと明言する。
