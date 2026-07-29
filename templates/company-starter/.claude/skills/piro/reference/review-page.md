# Instructions for generating the requirements.html review page

Convert requirements.md into a single HTML file for human review. The md is always the source of truth;
regenerate whenever you update the md.
It lives inside the spec folder (`.kiro/specs/<slug>/requirements.html`). Kiro doesn't read it.

## Technical requirements

- Fully self-contained: no external CDN, external fonts, external images or fetch. CSS inline in `<style>`
- `<html lang="en">`, UTF-8
- Font: `font-family: system-ui, "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`
  (the CJK fallbacks are kept so requirement text in Japanese still renders)
- **No box-shadow with blur** (it degrades into grey bands when printed or turned into a PDF). Shadows should be flat, or use a border only
- No em dashes
- Put wide elements (tables etc.) inside a container with `overflow-x: auto`

## Structure (top to bottom)

1. **Header**: spec name (slug) / generation date / target project path
2. **Introduction**: the prose from requirements.md, as-is
3. **Glossary**: a 2-column table (term / definition)
4. **Requirement cards** (one per Requirement):
   - Heading "Requirement N: title"
   - User Story (As a / I want / so that, laid out visually)
   - Acceptance Criteria: a numbered list. Wrap the EARS keywords (WHEN / IF / THEN / WHILE / WHERE /
     FOR EACH / THE / SHALL / SHALL CONTINUE TO) in `<span class="kw">` to display them as badges.
     Put a label for the applicable pattern in the top right of each line (event-driven / unwanted / state /
     optional / iteration / ubiquitous / regression)
5. **Footer: review checklist**
   - Gaps: is anything in the request not captured?
   - Excess: are there requirements nobody asked for?
   - Ambiguity: is any acceptance criterion open to two readings?
   - Verifiability: is any acceptance criterion impossible to judge with a test?
   - Assumptions: the list of assumptions piro filled in (the same as reported in the chat)

## Skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Requirements Review: {slug}</title>
<style>
  :root { --ink:#1a2333; --paper:#f7f8fa; --card:#ffffff; --accent:#2a5db0; --line:#d8dde6; }
  * { box-sizing:border-box; }
  body { margin:0; padding:2rem 1rem; background:var(--paper); color:var(--ink);
         font-family:system-ui,"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif; line-height:1.8; }
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
    <h1>Requirements Review: {feature name}</h1>
    <div class="meta">spec: {slug} · generated: {YYYY-MM-DD} · target: {project path}</div>
  </header>
  <section><h2>Introduction</h2><p>{prose}</p></section>
  <section><h2>Glossary</h2>
    <div class="tablewrap"><table><tr><th>Term</th><th>Definition</th></tr>{rows}</table></div>
  </section>
  <section>
    <h2>Requirements</h2>
    <div class="req-card">
      <h3>Requirement 1: {title}</h3>
      <div class="story">As a {role}, I want {feature}, so that {benefit}.</div>
      <ol class="ac">
        <li><span class="pattern">event-driven</span>
          <span class="kw">WHEN</span> the user does X, <span class="kw">THE</span> Y
          <span class="kw">SHALL</span> do Z</li>
      </ol>
    </div>
  </section>
  <section class="checklist">
    <h2>Review checklist</h2>
    <ul>
      <li>Gaps: is anything in the request not captured?</li>
      <li>Excess: are there requirements nobody asked for?</li>
      <li>Ambiguity: is any acceptance criterion open to two readings?</li>
      <li>Verifiability: is any acceptance criterion impossible to judge with a test?</li>
    </ul>
    <h2>Assumptions piro filled in</h2>
    <ul>{list of assumptions}</ul>
  </section>
</main>
</body>
</html>
```
