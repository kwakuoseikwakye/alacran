# Issue-First 原則

> "Everything starts with an Issue. Labels define the state."

すべての作業は GitHub Issue から始まります。ラベルが状態を定義します。
本ルールは実装作業（Phase 3: 実行）に入る前に必ず適用してください。

## 1. Issue が必要かどうかの判断

| 作業の種類 | Issue 要件 |
|-----------|-----------|
| 単純変更（1 ファイル、設定変更、typo 修正） | 推奨（省略可） |
| 通常変更（複数ファイルにまたがる変更） | 必須 |
| 複合タスク（3 ステップ以上、または複数日にまたがる） | Epic Issue 必須 + 子 Issue 分解 |
| 金額・契約・不可逆操作が絡む変更 | 必須 + `.claude/rules/hitl-gate.md` のトリガーも確認 |

迷ったら「必須」側に倒す。Issue を書く数分のコストより、後から経緯を追えなくなるコストの方が高い。

## 2. 着手前に既存 Issue を確認する

新しい Issue を起票する前に、重複がないか確認します。

```bash
gh issue list --search "<キーワード>" --state all
gh issue list --label "type:epic" --state open
```

類似 Issue が見つかった場合は、新規起票ではなくコメント追記や既存 Issue の再オープンを検討する。

## 3. Issue が無い場合の起票

複合タスクは `/create-epic` コマンドで Epic Issue + 子 Issue 分解を行う。
単発の作業は `gh issue create` で直接起票してよい:

```bash
gh issue create \
  --title "<簡潔なタイトル>" \
  --label "type:child,phase:planning" \
  --body "<背景・完了条件>"
```

## 4. ブランチ命名規約

Issue 番号を必ずブランチ名に含める。

| 種別 | 命名パターン | 例 |
|------|-------------|-----|
| 機能追加 | `feat/<Issue番号>-<短い説明>` | `feat/12-add-retro-template` |
| バグ修正 | `fix/<Issue番号>-<短い説明>` | `fix/15-verify-py-typo` |

`<短い説明>` は英数字とハイフンのみ、3-5 単語程度に収める。

## 5. コミットメッセージ規約

Conventional Commits 形式 + Issue 番号参照を必須とする。

```
<type>(<scope>): <description> (#<Issue番号>)
```

| type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `refactor` | 挙動を変えないコード整理 |
| `chore` | ビルド・設定・依存関係の変更 |

例:

```
fix(verify): ontology yaml の parse エラーメッセージを改善 (#15)
```

`git commit` 実行後、PostToolUse hook `.claude/hooks/commit-msg-advisor.sh` が
`git log -1` で実際にコミットされたメッセージを検査し、Conventional Commits 形式・
Issue 参照（`#N`）の有無を additionalContext 経由でエージェントに advisory として
届ける（Issue #41）。指摘があれば `git commit --amend` 等で修正する。

## 6. PR 本文の要件

PR には対応する Issue への参照を必ず含める。

```markdown
## Summary
<変更内容の要約>

## Related
Resolves #<Issue番号>
```

Epic 配下の子 Issue を解決する PR は、Epic 本体ではなく **子 Issue 番号** を `Resolves` に書く。
Epic は全子 Issue の Close をもって自動的に完了とみなす。

## 7. 違反した場合の対応

先に実装を始めてしまい、Issue を起票していなかったことに後から気づいた場合:

1. 作業を中断せず、まず Issue を起票する（事後起票でよい）
2. Issue 本文に「実装が Issue 起票に先行したこと」を明記する（隠さない）
3. 以降のコミット・PR には通常通り Issue 番号を参照する
4. `/handoff` の「Blockers」または「Done today」に、Issue-First 原則から外れた経緯を一言残す

Issue-First の目的は「先に作る」ことそのものより、「経緯を追跡可能な状態に保つ」ことにある。
事後であっても記録を残すことを優先する。

## 7.5. オフライン代替（gh・ネットワークが使えない場合）

`gh` コマンドやネットワークが使えない環境（オフライン演習・ネットワーク制限のある環境等）では、
その場で Issue を起票できません。この場合も作業を止めず、以下の代替手順を取ります。

1. 事後起票を前提として作業を進める（§7 と同じ考え方）
2. コミットメッセージに「Issue 化予定」であることを一言残す（例:
   `fix(scope): description (issue化予定)`）
3. セッション終了時、`/handoff` の `HANDOFF.md`「Blockers」に、Issue 未起票である旨と
   起票予定の内容を明記する
4. 接続が回復し次第、次のセッションで必ず Issue を起票し、該当コミットのハッシュを
   Issue 本文に事後参照として追記する

## 8. アンチパターン

| アンチパターン | 理由 |
|----------------|------|
| Issue 無しで複数ファイルにまたがる変更をコミットする | 変更理由が追跡不能になる |
| 1 つの Issue に無関係な複数の変更を混ぜる | レビューが困難になり、revert 時に巻き添えが出る |
| Epic Issue 本体に直接実装コミットを紐付ける | 子 Issue 分解の意味が失われる |
| ラベル無しで Issue を放置する | 状態が読み取れず、棚卸しが不可能になる |

---

*ai-retreat-starter — Issue-First 原則*
