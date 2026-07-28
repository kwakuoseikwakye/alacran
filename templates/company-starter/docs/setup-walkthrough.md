# 15-Minute Setup Walkthrough（期待挙動リファレンス）

> 目的: 本テンプレをフレッシュな環境でセットアップした際に、各ステップで**何が起きるべきか**を明示する参照文書。
> 使い方: 自分でセットアップして「あれ、この挙動でいいんだっけ？」と思ったらこのファイルと突き合わせる。
> 位置づけ: `docs/starter-manual.md` §2「15分セットアップ」の**詳細版**。手順の意図は starter-manual.md、
> 実際に出るべき出力はこのファイル、という役割分担。

---

## 前提条件

| ツール | 想定バージョン | 確認コマンド |
|---|---|---|
| Python | 3.9 以上 | `python3 --version` |
| Git | 2.x 以上 | `git --version` |
| GitHub CLI (`gh`) | 2.x 以上 | `gh --version` |
| Claude Code CLI | Pro 以上 or Claude Code 対応プラン | `claude --version` |

いずれか 1 つでも未導入だと以降のステップで詰まる。代表的なエラー例:

```bash
$ python3 scripts/verify.py
ERROR: pyyaml required. install: pip3 install pyyaml
```

```bash
$ gh issue list
gh: To use GitHub CLI, please authenticate: gh auth login
```

```bash
$ claude
zsh: command not found: claude
```

→ それぞれ `pip3 install pyyaml` / `gh auth login` / Claude Code CLI のインストールで解消する。

---

## Timeline

15 分想定のタイムラインを示す。実測は環境（ネットワーク速度、対話の速さ）によって前後する。

| # | ステップ | 目安時間 | 入力/操作 | 期待出力サマリ |
|---|---|---|---|---|
| 1 | "Use this template" で新規 private リポ作成 | 1 分 | GitHub UI から実行 | 自分の GitHub アカウントに private リポができる。初回コミットは本テンプレの `main` と同一 |
| 2 | `git clone` + `cd` | 30 秒 | `git clone git@github.com:<your-account>/<your-repo-name>.git` | 約 85 件のファイルが追跡される（テンプレの成長により変動。`git ls-files \| wc -l` で確認可） |
| 3 | 前提ツール確認 | 1 分 | `python3 --version && git --version && gh --version && claude --version` | 全コマンドがバージョン文字列を返す（エラーなし） |
| 4 | gh 認証（未認証時のみ） | 2 分 | `gh auth status` → 未認証なら `gh auth login` | `Logged in to github.com account <your-account>` |
| 5 | 最初の `/verify` 実行 | 30 秒 | `python3 scripts/verify.py` | FAIL 0 件（INFO は未記入の棚 — kpi/cycles/retro/clients 等 — の分だけ残るのが正常） |
| 6 | Claude Code 起動 + CLAUDE.md 読込 | 1 分 | `claude` | プロンプトが起動する。以後 CLAUDE.md の内容に沿って振る舞う |
| 7 | `/define-company` 実行 | 5〜8 分 | Claude と対話（4 つの質問に回答） | `definitions/ontology/company.yaml` が新規生成される |
| 8 | `/verify` 再実行 | 30 秒 | `python3 scripts/verify.py` | `ONTOLOGY-01` が INFO → PASS に変わる（Step 7 完了の証拠）。他の INFO は残ってよい。FAIL 0 件 |
| 9 | 最初のコミット | 1 分 | `git add definitions/ontology/company.yaml && git commit -m "docs(ontology): 自社オントロジーの初版を定義"` | commit 成功。hook（もしあれば）は advisory のみで非ブロッキング |

合計目安: 約 12〜15 分（ステップ 4 の gh 未認証対応が発生する場合は +2 分）。

---

## Step-by-step expected output

### Step 3. 前提ツール確認

```
$ python3 --version
Python 3.9.x  (またはそれ以上)

$ git --version
git version 2.x.x

$ gh --version
gh version 2.x.x (YYYY-MM-DD)

$ claude --version
x.x.x (Claude Code)
```

いずれかがバージョン表示されずエラーになった場合は、そのツールの導入が先決。

### Step 4. gh 認証確認

```
$ gh auth status
✓ Logged in to github.com account <your-account> (keyring)
```

未認証の場合:

```
$ gh auth status
You are not logged into any GitHub hosts.
```

→ `gh auth login` を実行し、対話プロンプトで `GitHub.com` → `HTTPS` または `SSH` → ブラウザ認証、の順に選択する。

### Step 5. 最初の `/verify` 実行

```
$ python3 scripts/verify.py
RQT verify — running...

## STRUCTURE
  [✓] STRUCTURE-01     PASS   LICENSE.md exists
  [✓] STRUCTURE-02     PASS   .gitignore effectively blocks secrets/ and .env
  [✓] STRUCTURE-03     PASS   CLAUDE.md exists
  [✓] STRUCTURE-04     PASS   README.md exists

## HYGIENE
  [✓] HYGIENE-01       PASS   no TODO(temp) markers found

## ONTOLOGY
  [i] ONTOLOGY-01      INFO   no yaml files under definitions/ontology/

## HITL
  [✓] HITL-01          PASS   hitl-gate.md has a trigger table
  [i] HITL-02          INFO   3 trigger template(s) still contain <<TODO>> placeholders — ...

... （STRUCT-DEF / STRUCT-DOC / EXAMPLE / DEFINITIONS / GEN / PATHREF と続く）

========================================
Total: 18  PASS: 12  WARN: 0  FAIL: 0  SKIP/INFO: 6
========================================
```

ここで確認すべきは **FAIL が 0 件であること**。`ONTOLOGY-01` を含む INFO 系のチェック（`HITL-02` /
`DEF-KPI-01` / `DEF-CYCLE-01` / `DEF-RETRO-01` / `DEF-CLIENT-01` 等）は該当する棚がまだ記入されて
いないことを示すだけで、FAIL ではない。「テンプレ配布直後にいきなり赤字だらけにしない」という
`scripts/verify.py` の設計方針どおり。RQT の総数はテンプレの成長とともに増減するため、
`Total` や `PASS` の具体的な件数そのものを覚える必要はない。判定基準は常に **FAIL 0 件**。

### Step 6. Claude Code 起動

```
$ claude
```

起動すると Claude Code のセッションが立ち上がり、`CLAUDE.md` を自動的に読み込む。ターミナルに
エラーが出ず、対話プロンプトが表示されれば正常。

### Step 7. `/define-company` 実行

```
> /define-company
```

Claude が `docs/templates/ontology-starter.yaml` を読み込んだうえで、以下 4 つの質問を**1 つずつ順番に**投げてくる
（まとめて聞いてきた場合は想定外の挙動）:

1. 事業ドメイン（どんな問題を解決しているか）
2. 主要ステークホルダー（誰が事業の中心にいるか）
3. コアバリューフロー（インプット → 変換 → アウトプット）
4. 現在最大のボトルネック

全問回答すると、`definitions/ontology/company.yaml` が生成され、Claude が内容を要約して提示する。
このタイミングで内容の修正依頼をしてもよい。曖昧な項目は `status: draft` のまま残ってよい設計。

### Step 8. `/verify` 再実行

```
$ python3 scripts/verify.py
...
## ONTOLOGY
  [✓] ONTOLOGY-01      PASS   1 ontology yaml file(s) parse OK
...
========================================
Total: 18  PASS: 13  WARN: 0  FAIL: 0  SKIP/INFO: 5
========================================
```

`ONTOLOGY-01` が `INFO` → `PASS` に変わることが Step 7 が正しく完了している証拠。
`DEF-KPI-01` / `DEF-CYCLE-01` / `DEF-RETRO-01` / `DEF-CLIENT-01` 等、他の棚の INFO はまだ記入していない
だけなので残ってよい。ここでも判定基準は **FAIL 0 件**（`SKIP/INFO` が全て 0 になる必要はない）。

### Step 9. 最初のコミット

```
$ git add definitions/ontology/company.yaml
$ git commit -m "docs(ontology): 自社オントロジーの初版を定義"
[main xxxxxxx] docs(ontology): 自社オントロジーの初版を定義
 1 file changed, N insertions(+)
```

hooks が配線されている場合、commit 前後に advisory メッセージが出ることがあるが、
**exit 0 で非ブロッキング**な設計なので commit 自体は成功する。エラーで commit が止まった場合は
「動かない」のではなく「別の問題を検知して意図的に止めている」ケースなので、メッセージを読んで対応する。

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `python3 scripts/verify.py` が `ModuleNotFoundError` 系で落ちる | `pyyaml` 未インストール | `pip3 install pyyaml` |
| `gh` コマンドで認証エラーが出る | `gh auth login` 未実施 | `gh auth login` を実行し、SSH または HTTPS を選択して対話ログイン |
| CI（`verify.yml`）の `secret-scan` job が fail する | private リポで GitHub Advanced Security が有効化されていない状態からの push 等 | まずは PR ではなく直接 push で挙動を確認する。secret-scan 自体は CI 同梱の gitleaks（無償）で動くため追加設定は不要 |
| `/define-company` が `docs/templates/ontology-starter.yaml` を見つけられない | clone が不完全、または誤ったディレクトリで作業している | `find . -name ontology-starter.yaml` で存在確認。見つからなければ `git clone` からやり直す |
| `python3 scripts/verify.py` の `HYGIENE-01` が FAIL する | `TODO(temp)` マーカーが 30 日以上放置されている | 該当箇所を実装完了させてマーカーを除去する。検証ロジック側（`scripts/verify.py`）を弱めて通すのは禁止 |
| `claude` コマンドが `command not found` | Claude Code CLI 未導入 | Claude Code のインストール手順に従って導入する |
| `definitions/ontology/company.yaml` が生成されない | `/define-company` の質問に全て答え終わっていない | Claude とのやり取りを最後まで進める。質問を飛ばして中断すると生成されない |
| 文書に書かれた `python3 scripts/verify.py` の期待出力と、実行結果の合計件数（Total）が違って見える | RQT はテンプレの成長とともに増えていくため、件数が一致することは要件ではない | 判定基準は常に FAIL 0 件。INFO は未記入の棚の分だけ残っていれば正常 |

---

## Success criteria（15分後の期待状態）

- [ ] `python3 scripts/verify.py` の全 RQT が PASS または INFO（FAIL は 0 件。件数そのものは問わない）
- [ ] `definitions/ontology/company.yaml` が commit 済（自社ドメインの内容が反映されている、または `status: draft`）
- [ ] Claude Code 上で `/verify` `/define-company` の 2 コマンドが動作確認済み
- [ ] `git log` に少なくとも 1 件、自分で作った commit が積まれている

---

## 次のステップ

- `exercises/01-define-your-company.md` — Step 7 を `/define-company` のスキップ等で飛ばしていた場合、ここで詳細な手順を確認しながらやり直す
- `exercises/02-first-hitl-gate.md` — HITL Gate を実際に体感する演習
- `exercises/03-run-verify-loop.md` — `scripts/verify.py` に自社の RQT を追加する演習

---

*ai-retreat-starter — 15-Minute Setup Walkthrough*
