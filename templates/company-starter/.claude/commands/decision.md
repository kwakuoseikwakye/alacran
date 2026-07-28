---
name: decision
description: Decision RFC を対話的に起票し docs/decisions/YYYY-MM-DD-{slug}.md を生成する（Phase 5: 記録）
---

# /decision

意思決定の根拠を後から追跡できるよう、Decision RFC を `docs/decisions/` に記録します。

## 進め方

1. ユーザーに以下を対話的に質問する（1 つずつ）:
   - **Context**: どんな状況・制約のもとでこの判断が必要になりましたか？
   - **Decision**: 何を決めましたか？（一文で言い切れる形に）
   - **Rationale**: なぜその決定が最善だと考えましたか？
   - **Alternatives Considered**: 他にどんな選択肢を検討し、なぜ採用しなかったですか？
   - **Consequences**: この決定によって何が変わりますか？（良い影響・悪い影響の両方）
2. 決定内容から短い slug（英数字とハイフンのみ、2-4 語）を生成する。
3. 今日の日付を `date` コマンドで取得し、ファイルパスを決定する:
   ```
   docs/decisions/<YYYY-MM-DD>-<slug>.md
   ```
4. 以下のテンプレートで Write する（frontmatter は
   `docs/decisions/2026-07-03-obsidian-context-stock.md` §3 の L2 共通スキーマに準拠。
   既存 `date`/`status` は後方互換のため維持したまま `type`/`created`/`updated`/`tags` を追加する）:

   ```markdown
   ---
   date: <YYYY-MM-DD>
   status: proposed
   type: decision
   created: <YYYY-MM-DD>
   updated: <YYYY-MM-DD>
   tags: []
   ---

   # <Decision のタイトル>

   ## Context

   <ユーザーの回答>

   ## Decision

   <ユーザーの回答>

   ## Rationale

   <ユーザーの回答>

   ## Alternatives Considered

   <ユーザーの回答。箇条書き推奨>

   ## Consequences

   <ユーザーの回答>
   ```

5. 生成後、内容を要約してユーザーに提示し、`status` を `proposed` のままにするか、この場で
   `accepted` に確定するか確認する。

## status の値

| status | 意味 |
|--------|------|
| `proposed` | 提案段階。まだ確定していない |
| `accepted` | 確定し、実行に移す判断 |
| `superseded` | 後続の別 Decision に置き換えられた（元ファイルは削除せず残す） |

## 注意事項

- 既存の Decision を上書きしない。内容が変わった場合は新しい Decision を作り、古い方の
  frontmatter を `status: superseded` に更新して新ファイルへの参照を追記する。
- `status` を変更する際（`proposed` → `accepted` 等）は `updated` も同じ日付に更新する。
- 既存ファイル（`type`/`created`/`updated`/`tags` を持たないもの）は遡及的に一括改変しない。
  新規作成分から本スキーマを適用する。
- 金額・契約・不可逆操作に関わる Decision は `.claude/rules/hitl-gate.md` のトリガーに
  該当しないか必ず確認する。該当する場合は Decision 記録の前に人間承認を得る。
