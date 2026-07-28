# requirements.html レビューページ生成指示

requirements.md を人間レビュー用の単一HTMLに変換する。正は常に md。md を更新したら必ず再生成する。
置き場所は spec フォルダ内(`.kiro/specs/<slug>/requirements.html`)。Kiro は読まない。

## 技術要件

- 完全自己完結: 外部CDN・外部フォント・外部画像・fetch なし。CSSは `<style>` にインライン
- `<html lang="ja">`、UTF-8
- フォント: `font-family: "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
- **blur付き box-shadow 禁止**(印刷/PDF化でグレー帯に崩れる)。影はベタ影か border のみ
- em dash 不使用
- 幅の広い要素(テーブル等)は `overflow-x: auto` のコンテナに入れる

## 構成(上から順)

1. **ヘッダ**: spec名(slug)/ 生成日 / 対象プロジェクトパス
2. **Introduction**: requirements.md の散文をそのまま
3. **Glossary**: 2列テーブル(用語 / 定義)
4. **Requirement カード**(Requirement ごとに1枚):
   - 見出し「Requirement N: 題名」
   - User Story(As a / I want / so that を視覚化)
   - Acceptance Criteria: 番号付きリスト。EARSキーワード(WHEN / IF / THEN / WHILE / WHERE /
     FOR EACH / THE / SHALL / SHALL CONTINUE TO)を `<span class="kw">` で包んでバッジ表示。
     各行の右肩に適用パターン名ラベル(event-driven / unwanted / state / optional /
     iteration / ubiquitous / regression)
5. **フッタ: レビュー観点チェックリスト**
   - 漏れ: 依頼内容で拾えていない要望はないか
   - 過剰: 頼んでいないのに入っている要件はないか
   - 曖昧: 2通りに読める受入基準はないか
   - 検証可能性: テストで判定できない受入基準はないか
   - 前提: piroが埋めた前提の列挙(チャット報告と同じもの)

## スケルトン

```html
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Requirements Review: {slug}</title>
<style>
  :root { --ink:#1a2333; --paper:#f7f8fa; --card:#ffffff; --accent:#2a5db0; --line:#d8dde6; }
  * { box-sizing:border-box; }
  body { margin:0; padding:2rem 1rem; background:var(--paper); color:var(--ink);
         font-family:"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif; line-height:1.8; }
  main { max-width:860px; margin:0 auto; }
  header { border-bottom:3px solid var(--accent); padding-bottom:1rem; margin-bottom:2rem; }
  header h1 { margin:0 0 .25rem; font-size:1.5rem; }
  header .meta { color:#5a6474; font-size:.85rem; }
  section { margin-bottom:2rem; }
  h2 { font-size:1.15rem; border-left:4px solid var(--accent); padding-left:.6rem; }
  .tablewrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; background:var(--card); }
  th,td { border:1px solid var(--line); padding:.5rem .75rem; text-align:left; font-size:.9rem; }
  .req-card { background:var(--card); border:1px solid var(--line); border-radius:8px;
              padding:1rem 1.25rem; margin-bottom:1rem; }
  .req-card h3 { margin:0 0 .5rem; font-size:1.05rem; }
  .story { background:#eef3fb; border-radius:6px; padding:.6rem .9rem; font-size:.9rem; }
  .ac { padding-left:1.4rem; }
  .ac li { margin:.5rem 0; font-size:.92rem; }
  .kw { display:inline-block; background:var(--accent); color:#fff; border-radius:4px;
        padding:0 .35em; font-size:.78em; font-weight:700; letter-spacing:.02em; }
  .pattern { float:right; color:#8a93a3; font-size:.72rem; text-transform:uppercase; }
  .checklist { background:var(--card); border:1px dashed var(--accent); border-radius:8px;
               padding:1rem 1.25rem; }
  code { background:#eef0f4; padding:0 .3em; border-radius:3px; font-size:.9em; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#e6e9ef; --paper:#14181f; --card:#1d232d; --accent:#6ea3e8; --line:#333b48; }
    .story { background:#232c3b; }
    code { background:#2a323e; }
  }
</style>
</head>
<body>
<main>
  <header>
    <h1>Requirements Review: {機能名}</h1>
    <div class="meta">spec: {slug} ・ 生成日: {YYYY-MM-DD} ・ 対象: {プロジェクトパス}</div>
  </header>
  <section><h2>Introduction</h2><p>{散文}</p></section>
  <section><h2>Glossary</h2>
    <div class="tablewrap"><table><tr><th>用語</th><th>定義</th></tr>{行}</table></div>
  </section>
  <section>
    <h2>Requirements</h2>
    <div class="req-card">
      <h3>Requirement 1: {題名}</h3>
      <div class="story">As a {役割}, I want {機能}, so that {便益}.</div>
      <ol class="ac">
        <li><span class="pattern">event-driven</span>
          <span class="kw">WHEN</span> ユーザーが○○した時、<span class="kw">THE</span> ○○
          <span class="kw">SHALL</span> ○○する</li>
      </ol>
    </div>
  </section>
  <section class="checklist">
    <h2>レビュー観点</h2>
    <ul>
      <li>漏れ: 依頼内容で拾えていない要望はないか</li>
      <li>過剰: 頼んでいないのに入っている要件はないか</li>
      <li>曖昧: 2通りに読める受入基準はないか</li>
      <li>検証可能性: テストで判定できない受入基準はないか</li>
    </ul>
    <h2>piroが埋めた前提</h2>
    <ul>{前提の列挙}</ul>
  </section>
</main>
</body>
</html>
```
