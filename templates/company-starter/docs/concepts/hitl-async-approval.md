# HITL 非同期承認 — 承認者 1 人問題を乗り越える

> 承認ゲート（HITL Gate）は安全装置だが、素朴に作ると「承認者が 1 人で、その人が
> 不在だと会社全体が止まる」という単一障害点（SPOF）になる。これを非同期承認と
> 縮退規則で緩和する。

思想の全体像は `.claude/rules/hitl-gate.md`、承認者の写像は
`definitions/hitl/approver-registry.yaml` を参照。

---

## 1. 承認 SPOF 問題

小さな会社では、承認者が実質 1 人（オーナー）のことが多い。このとき素朴な承認ゲートは:

- オーナーが 24 時間不在 → 承認待ちタスクが全部止まる → **サイクル全体が停止**
- 役職名（CEO / CFO …）を並べても、実体が全部同じ人なら「別人が承認するフリ（擬制）」になる

**出発点は擬制をやめること**。承認者が 1 人なら、`approver-registry.yaml` で全役割を正直に
同一人物へ写像し、代理は `vacant`（空席）と書く。事実を隠さないことが対策の第一歩です。

---

## 2. 縮退規則（sole-owner mode）

承認者と代理が同一人物に解決される（＝実質 1 人）とき、severity 別に挙動を切り替える。

| severity | 時間切れの挙動 | 自動承認 |
|----------|--------------|---------|
| `critical` | 該当項目のみ保留（`hold_item_only`） | **禁止** |
| `high` | 該当項目のみ保留 | **禁止** |
| `medium` | ログを残して自動承認（`auto_approve_with_log`） | 許可 |

ポイントは 2 つ:

- **critical / high は絶対に auto-approve しない**。速度のために不可逆・高リスクの承認を
  省くのは、リスクが非対称（失敗の代償が大きすぎる）なので禁止する。
- **停止範囲を「該当項目だけ」に縮める**。承認待ちの 1 件を保留しても、承認の要らない
  他タスクはサイクルごと止めない（`item_isolation.suspend_whole_cycle: false`）。
  「人間不在＝会社停止」を「人間不在＝その 1 件だけ停滞」に縮小する。

---

## 3. GitHub label による非同期承認

承認を「その場で待つ同期処理」ではなく、「ラベルで後追いする非同期処理」にする。

```
1. ゲート発火 → 承認待ちの Issue を立て、hitl:<trigger> ラベルを付ける
2. AI / 担当は、その 1 件は保留したまま他タスクを進める
3. 承認者は手が空いたときにラベル付き Issue を確認し、承認/却下をコメント
4. 承認されたら保留していた項目を進める
```

こうすると、承認者が別作業中でも他の仕事は止まらない。トリガー yaml では
`notify: github_label` を指定し、`notify_label` にラベル名を書く。緊急・対面が
自然な場面だけ `notify: manual`（チャット/口頭で即時確認）を使う。

> このテンプレは外部の承認 SaaS を持ち込まず、GitHub の Issue + ラベルと手動確認だけで
> 非同期承認を成立させます（plain Claude Code + GitHub の範囲）。

---

## 4. 関連

- `definitions/hitl/approver-registry.yaml` — 役割→承認者の写像 + 縮退規則
- `definitions/hitl/triggers/_schema.md` — トリガー記法（notify / on_timeout）
- `.claude/rules/hitl-gate.md` — HITL Gate の 5 カテゴリと基本手順
