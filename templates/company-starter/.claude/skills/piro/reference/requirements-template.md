# requirements.md テンプレート(Kiro実物準拠)

構造は以下に固定する。見出しは英語のまま。EARSの書き方は [ears.md](ears.md) を参照。

## 構造

```markdown
# Requirements Document

## Introduction

[機能の背景・目的・スコープを1〜3段落の散文で。なぜ作るか、何を解決するかを書く]

## Glossary

- **<エンティティ名>**: <定義。EARSの THE の主語に使う固有名をここで全部定義する>
- **<エンティティ名>**: <定義>

## Requirements

### Requirement 1: <要件の題名>

**User Story:** As a <役割>, I want <機能>, so that <便益>.

#### Acceptance Criteria

1. <EARS文>
2. <EARS文>

### Requirement 2: <要件の題名>

(以下同形)
```

## 規約

- Requirement番号(N)と受入基準番号(M)の組 N.M が tasks.md からの参照キー。欠番・重複を作らない
- User Story は1行で「As a / I want / so that」の3要素を必ず持つ(本文は日本語でよいが
  この3キーワードは英語のまま)
- Glossary に無い固有名を EARS の主語に使わない
- 要件数の目安: 小機能で3〜6、中機能で6〜12。1つの Requirement の受入基準は2〜7個
- 対象機能に関係する非機能要件(性能・ログ・エラー処理)も Requirement として立てる
- 異常系は IF ... THEN の Unwanted behavior として、正常系と同じ Requirement 内か
  独立した Requirement(Error Handling)として必ず書く
