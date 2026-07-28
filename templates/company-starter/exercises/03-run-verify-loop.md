# Exercise 03: verify ループを回す

**目安時間**: 20-30 分
**前提**: Exercise 01, 02 を完了していること。`python3` が使える環境であること。

## ゴール

「偽緑禁止」の原則（`CLAUDE.md` §2.5）を体で理解します。`scripts/verify.py` を実行し、
FAIL/WARN を実際に読み、直し、再実行するループを 1 周体験した上で、自分の RQT を 1 件追加します。

## 手順

### Step 1. `/verify` を実行する

Claude Code のセッションで:

```
/verify
```

または直接:

```bash
python3 scripts/verify.py
```

出力はカテゴリ別（`STRUCTURE` / `HARNESS` / `HYGIENE` / `ONTOLOGY` / `HITL` / `STRUCT-DEF` /
`STRUCT-DOC` / `EXAMPLE` / `DEFINITIONS` / `GEN` / `META` / `CONTEXT` / `PATHREF` の全 13 カテゴリ）に整理され、
各行が `[✓|!|✗|-|i] <RQT-ID> <STATUS> <メッセージ>` の形式で表示されます。

### Step 2. 出力を読む

以下のステータスの意味を確認してください。

| マーク    | ステータス  | 意味                                               |
| --------- | ----------- | -------------------------------------------------- |
| `✓`       | PASS        | 検証項目クリア                                     |
| `!`       | WARN        | 動くが望ましくない状態                             |
| `✗`       | FAIL        | 検証項目が満たされていない。**修正必須**           |
| `-` / `i` | SKIP / INFO | 対象がまだ存在しない・任意項目。今すぐの対応は不要 |

Exercise 01, 02 を完了していれば、`ONTOLOGY-01`（`definitions/ontology/*.yaml` の構文チェック）と
`HITL-01`（`.claude/rules/hitl-gate.md` にトリガーテーブルがあるか）が `PASS` になっているはずです。

### Step 3. FAIL または WARN を 1 件見つけて直す

もし `FAIL` が出ていなければ、意図的に壊してみましょう（学習目的、すぐ戻します）。

```bash
# .gitignore の `secrets/**` の行を一時的にコメントアウトしてみる（先頭に # を付ける）
```

再度 `/verify` を実行し、`STRUCTURE-02` が `FAIL` になることを確認してください。
メッセージ（`.gitignore does not effectively block: ['secrets/']`）を読み、原因
（`secrets/**` をコメントアウトしたことで有効な遮断行が無くなったこと）を特定してから
元に戻します。なお `STRUCTURE-02` は否定行（`!secrets/...`）に文字列が残っていても
「実効的に遮断できているか」を git check-ignore で判定するため、コメントアウトでは
ごまかせません（偽緑禁止）。

**重要**: FAIL を消すために `scripts/verify.py` 側の判定ロジックを緩めてはいけません
（偽緑禁止）。直すのは常に検証対象（今回は `.gitignore`）の方です。

### Step 4. 再実行して PASS を確認する

```bash
python3 scripts/verify.py
```

先ほど `FAIL` だった `STRUCTURE-02` が `PASS` に戻っていることを確認します。

### Step 5. 自分の RQT を追加する

`scripts/verify.py` の `verify_structure()` 関数に倣い、自社固有のチェックを 1 つ追加します。
例として「会社概要ドキュメントが存在するか」を確認する `STRUCTURE-05` を追加してみましょう。

まず対象ファイルを用意します（無ければ簡単な内容で作成してください）。

```bash
mkdir -p docs
cat > docs/company-overview.md <<'EOF'
# 会社概要

（Exercise 01 の definitions/ontology/company.yaml を要約したものをここに書く）
EOF
```

次に `scripts/verify.py` の `verify_structure()` 関数末尾（`STRUCTURE-04` の直後）に以下を追加します。

```python
    # STRUCTURE-05: 会社概要ドキュメント
    if (REPO_ROOT / "docs" / "company-overview.md").exists():
        r.add(cat, "STRUCTURE-05", "PASS", "docs/company-overview.md exists")
    else:
        r.add(cat, "STRUCTURE-05", "FAIL", "docs/company-overview.md not found")
```

`verify_structure()` は既に `main()` の呼び出しリストに含まれているため、新しい RQT を
関数内に追記するだけで自動的に実行対象になります（新しい `verify_*()` 関数を丸ごと追加する
場合のみ、`main()` の呼び出しリストへの追記が別途必要です）。

### Step 6. 再実行して新しい RQT を確認する

```bash
python3 scripts/verify.py
```

`STRUCTURE-05` が出力に現れ、Step 5 で作成した会社概要ドキュメントの有無に応じて `PASS`/`FAIL`
することを確認してください。

### Step 7. コミットする

```bash
git add scripts/verify.py docs/company-overview.md
git commit -m "test(verify): STRUCTURE-05 (会社概要ドキュメント存在確認) を追加"
```

## 期待される出力

- `/verify` の出力を最低 2 回読んだ（1 回目: 現状確認、2 回目: 修正後の再確認）
- 意図的な FAIL を作り、原因を特定し、修正して PASS に戻す一連の流れを体験した
- `scripts/verify.py` に `STRUCTURE-05` のような自作 RQT が追加されている
- 上記変更を含む git コミットが 1 つ

## 振り返りの問い

- 「偽緑禁止」を破ると何が起きますか？（検証ロジックを緩めて FAIL を隠した場合、誰が困りますか）
- 自社の運用でこの先追加したい RQT は他にありますか？（例: 特定の必須ドキュメントの存在、
  命名規約の遵守、機密情報のパターン検出）

## 次へ

3 つの演習が完了しました。ここまでで作った `definitions/ontology/company.yaml`・
`.claude/rules/hitl-gate.md` の追加行・`scripts/verify.py` の追加 RQT は、あなたの会社に
AI 駆動経営ハーネスを立ち上げる最初の一歩です。午前のセッションで `/create-epic` により
Epic Issue を起票済みであれば、その続きに着手してください。まだ起票していなければ、
`/create-epic` で実際の経営課題を Epic Issue として起票してみましょう。
