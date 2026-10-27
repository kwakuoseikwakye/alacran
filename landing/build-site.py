#!/usr/bin/env python3
"""Build every page of the site from ../docs/website-copy.md.

The copy document is the single source of truth for the words. Only the text
under each page's "### Website copy" heading is published; implementation
notes, release checks and the editorial introduction stay in the document and
never reach HTML. The copy file lives outside landing/ on purpose, because
everything in landing/ is served publicly.

Edit the copy, then run:
    python3 build-site.py && python3 build-md.py
"""
from __future__ import annotations

import html
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SRC = HERE.parent / "docs" / "website-copy.md"
SITE = "https://www.alacran.app"
DL = "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/"
DOWNLOADS = [
    ("Alacran-arm64.dmg", "Mac", "Apple Silicon"),
    ("Alacran-x64.dmg", "Mac", "Intel"),
    ("Alacran.deb", "Linux", "Debian / Ubuntu"),
]
NAV = [("/#features", "Product"), ("/use-cases", "Use cases"),
       ("/templates", "Starter packs"), ("/integrations", "Integrations")]
GUIDES = [("/getting-started", "Get started", "Install and save a first result"),
          ("/how-to-use", "How to use", "A daily routine with AI"),
          ("/docs", "Documentation", "Files, agents and controls")]
# CTA labels the copy writes without a route.
DEFAULT_ROUTES = {"Read the setup guide": "/getting-started"}
DOWNLOAD_LABEL = "Download Alacrán"
# Real screenshots of the app: name -> (alt, caption, detail crop).
# Files live in screens/ as <name>.webp (full) and <name>-1200.webp; sizes are
# read from the files. The detail crop (fractions left, top, right, bottom) is
# what a phone shows, because a whole desktop window at 360px is unreadable;
# build_details() cuts it to <name>-detail.webp. Every shot comes from a throwaway
# example company, never a real workspace, so each carries the copy's disclosure.
SAMPLE = "Example company · Sample data"
SHOTS = {
    "content": ("Content and social screen with approved post drafts for an example company", SAMPLE, (.22, .11, .71, .96)),
    "memory": ("Company memory map linking definitions, decisions, records and agents", SAMPLE, (.2, .27, .98, .93)),
    "finances": ("Finances screen showing cash on hand, monthly burn and estimated runway for an example company", SAMPLE, (.2, .27, .97, .9)),
    "office-dark": ("Home screen in the dark theme: one item needing attention, the 3D agent office with an agent waiting for approval, and a weekly summary ready to review", SAMPLE, (.17, .28, .7, .93)),
    "office-light": ("Home screen in the light theme: the agent office, one agent waiting for approval, and a weekly summary ready to review", SAMPLE, (.32, .3, .82, .93)),
    "approvals": ("Approvals screen with one pending review marked high risk, listing files the run changed outside its own folder", SAMPLE, (.32, .15, 1, 1)),
    "departments": ("Departments screen listing each department with its record files, and the people who sign off on changes", SAMPLE, (.14, .1, .99, .75)),
    "workflows": ("Workflows screen with daily cadence and governance workflows, each with Run in Terminal and Prepare draft buttons", SAMPLE, (.14, .12, .99, .75)),
    "preferences": ("Preferences screen where you name the assistant, choose the languages you each speak, and pick its voice", SAMPLE, (.38, .2, .76, .85)),
    # The tour's four captures: one sample company (Brightside Studio) and one
    # inquiry (Northstar Café), captured from the real app. Until all four
    # exist the tour runs in interim mode; see tour().
    "tour-briefing": ("Brightside Studio briefing showing a customer inquiry waiting for a reply", SAMPLE, None),
    "tour-followup": ("Follow-up draft for Northstar Café using the saved customer inquiry", SAMPLE, None),
    "tour-review": ("Review screen showing the revised follow-up draft and approval controls", SAMPLE, None),
    "tour-memory": ("Company record containing the approved follow-up draft", SAMPLE, None),
}
HERO_SHOTS = {"/departments/finances": "finances", "/departments/content": "content"}
TOUR_SHOTS = ["tour-briefing", "tour-followup", "tour-review", "tour-memory"]
# Interim tour, used until the four captures exist: only tabs a real screenshot
# honestly matches, with captions written for that screenshot. Customer
# follow-up has none (the old one was an empty assistant screen), so it is left
# out rather than shown under a label it does not prove.
TOUR_INTERIM_INTRO = "Screens from the app: what needs you today, a change waiting for review, and the company memory your agents read."
TOUR_INTERIM = {
    "Morning briefing": ("office-dark", "See what needs your attention and which agents are working."),
    "Review": ("approvals", "Check a proposed change, see what it touched, and choose what to keep."),
    "Company memory": ("memory", "See the facts, decisions and records your agents read, mapped in one place."),
}
# Screenshots placed under a section: (route, section heading) -> shot.
SECTION_SHOTS = {
    ("/how-to-use", "Start with the morning briefing."): "office-light",
    ("/how-to-use", "Review proposed work."): "approvals",
    ("/how-to-use", "Turn useful tasks into repeatable workflows."): "workflows",
    ("/how-to-use", "Use the assistant your way."): "preferences",
    ("/docs", "Departments and structured records"): "departments",
    ("/docs", "Skills and recurring workflows"): "workflows",
}
# Real vendor marks only, from brands.js (Simple Icons, never redrawn). Displayed name -> sprite key.
# A vendor with no mark here (Slack, OpenAI and so on) is named in text only.
MARKS = {"Beeper": "beeper", "WhatsApp": "whatsapp", "Discord": "discord", "Telegram": "telegram",
         "Notion": "notion", "GitHub": "github", "Vercel": "vercel", "Figma": "figma",
         "Claude Code": "claude", "Google Antigravity": "google-antigravity", "Kiro": "kiro", "Kimi": "kimi",
         "Anthropic API": "anthropic", "Google Workspace": "google"}
AGENTS = ("Claude Code", "Google Antigravity", "Kiro", "Kimi", "Codex")  # Codex has no available mark
IDS = set(re.findall(r'id="([bcd]-[a-z0-9-]+)"', (HERE / "brands.js").read_text(encoding="utf-8")))
OG_IMAGE = f"{SITE}/og.png"
OG_ALT = "Alacrán: Your business, organized. Your AI, put to work."


def e(s: str) -> str:
    return html.escape(s, quote=True)


def mark(key: str, v: str = "b") -> str:
    """A real vendor mark from the brands.js sprite. A bad key fails the build, not just a test."""
    if f"{v}-{key}" not in IDS:
        raise SystemExit(f"brands.js has no #{v}-{key}")
    return f'<svg class="bi" aria-hidden="true" focusable="false"><use href="#{v}-{key}"/></svg>'


def inl(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\* → `([^`]+)`",
               lambda m: f'<a class="go" href="{m[2]}">{m[1]} <span aria-hidden="true">→</span></a>', s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


# ---------------------------------------------------------------- parsing

def blocks(text: str) -> list[dict]:
    """Markdown lines -> a flat list of typed blocks."""
    out, para = [], []

    def flush():
        if para:
            out.append({"t": "p", "s": " ".join(para)})
            para.clear()

    for line in text.splitlines():
        s = line.rstrip()
        if not s.strip() or s.strip() == "---":
            flush()
            continue
        if m := re.match(r"^(#{1,4}) (.+)$", s):
            flush()
            title, anchor = m[2], None
            if a := re.search(r"\s*\{#([\w-]+)\}$", title):
                anchor, title = a[1], title[:a.start()]
            if a := re.search(r" — `#([\w-]+)`$", title):
                anchor, title = a[1], title[:a.start()]
            out.append({"t": f"h{len(m[1])}", "s": title, "id": anchor})
        elif s.startswith("> "):
            flush()
            out.append({"t": "quote", "s": s[2:]})
        elif m := re.match(r"^- (.+)$", s):
            flush()
            if out and out[-1]["t"] == "ul":
                out[-1]["items"].append(m[1])
            else:
                out.append({"t": "ul", "items": [m[1]]})
        elif m := re.match(r"^\d+\. (.+)$", s):
            flush()
            if out and out[-1]["t"] == "ol":
                out[-1]["items"].append(m[1])
            else:
                out.append({"t": "ol", "items": [m[1]]})
        elif s.startswith("|"):
            flush()
            cells = [c.strip() for c in s.strip("|").split("|")]
            if all(re.fullmatch(r":?-+:?", c) for c in cells):
                continue
            if out and out[-1]["t"] == "table":
                out[-1]["rows"].append(cells)
            else:
                out.append({"t": "table", "rows": [cells]})
        else:
            para.append(s.strip())
    flush()
    return out


def read_pages(src: str) -> list[dict]:
    parts = re.split(r"^## (\d\d)\. (.+)$", src, flags=re.M)
    pages = []
    for i in range(1, len(parts), 3):
        body = parts[i + 2]
        pages.append({
            "name": parts[i + 1].strip(),
            "route": re.search(r"^Route: `([^`]+)`", body, re.M)[1],
            "title": re.search(r"^SEO title: \*\*(.+)\*\*", body, re.M)[1],
            "desc": re.search(r"^Meta description: \*\*(.+)\*\*", body, re.M)[1],
            "blocks": blocks(re.search(r"^### Website copy.*?$(.*?)(?=^### (?:Implementation notes|Release checks)|^## [^\n]*not website copy|\Z)", body, re.M | re.S)[1]),
        })
    return pages


# ---------------------------------------------------------------- pieces

BRAND = ('<a class="brand" href="/" aria-label="Alacrán home">'
         '<img src="/logo.png" width="34" height="35" alt=""><span>Alacrán</span></a>')
BMC = ('<script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js" '
       'data-id="alacran" data-description="Support me on Buy me a coffee!" data-message="" data-color="#FF5F5F" '
       'data-position="Right" data-x_margin="18" data-y_margin="18"></script>')
SIDE = [("Guides", [("/getting-started", "Get started"), ("/how-to-use", "How to use"),
                    ("/docs", "Documentation"), ("/integrations", "Integrations")]),
        ("Departments", [("/departments/customers", "Customers"), ("/departments/finances", "Finances"),
                         ("/departments/content", "Content &amp; social"), ("/departments/messages", "Messages")]),
        ("Explore", [("/use-cases", "Use cases"), ("/templates", "Starter packs")])]
LEGAL_SIDE = [("Legal", [("/privacy", "Privacy"), ("/terms", "Terms")])]
LEGAL = ("/privacy", "/terms")
GALLERY = {"/templates": "packs", "/use-cases": "cases"}
# Departments with no dedicated screenshot borrow the app screen that honestly shows their work.
HERO_SHOTS.update({"/departments/customers": "departments", "/departments/messages": "approvals"})


def dl_items() -> str:
    """The three platform links and the setup-guide link: the one source for every download list on the site."""
    items = "".join(
        f'<a href="{DL}{f}" download><strong>{n}</strong><small>{d}</small><span class="tag">.{f.rsplit(".", 1)[1]}</span></a>'
        for f, n, d in DOWNLOADS)
    return items + '<a class="menu-foot" href="/getting-started">Read the setup guide <span aria-hidden="true">→</span></a>'


def dl_menu(cls: str = "") -> str:
    return (f'<details class="dl {cls}"><summary class="btn btn-primary" title="Choose Mac or Linux, then download Alacrán">{DOWNLOAD_LABEL}<span class="caret" aria-hidden="true"></span></summary>'
            f'<div class="menu">{dl_items()}</div></details>')


def cur(href: str, route: str) -> str:
    return ' aria-current="page"' if href == route else ""


def nav(route: str) -> str:
    links = "".join(f'<a href="{h}"{cur(h, route)}>{label}</a>' for h, label in NAV)
    on = ' class="is-current"' if any(h == route for h, *_ in GUIDES) else ""
    guides = "".join(f'<a href="{h}"{cur(h, route)}><strong>{label}</strong><small>{d}</small></a>' for h, label, d in GUIDES)
    return f"""<header class="nav" id="top"><div class="wrap nav-in">
  {BRAND}
  <nav class="nav-links" id="navlinks" aria-label="Main navigation">{links}<details class="guides"><summary{on}>Guides<span class="caret" aria-hidden="true"></span></summary><div class="menu">{guides}</div></details></nav>
  {dl_menu("dl-nav")}
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="navlinks" aria-label="Menu" title="Open the menu"><span></span><span></span></button>
</div></header>"""


FOOTER = f"""<footer class="foot"><div class="wrap">
  <div class="foot-top">
    <div class="foot-brand">
      {BRAND}
      <p class="foot-tag">Your business knowledge. Your AI. Your workspace.</p>
      <p>Alacrán brings business records, AI workflows, and human review together on your desktop.</p>
      <div class="foot-dl"><h2>{DOWNLOAD_LABEL}</h2>{dl_items()}</div>
    </div>
    <nav class="foot-cols" aria-label="Footer">
      <div><h2>Product</h2><a href="/#features">Features</a><a href="/templates">Starter packs</a><a href="/integrations">Integrations</a><a href="/use-cases">Use cases</a></div>
      <div><h2>Departments</h2><a href="/departments/customers">Customers</a><a href="/departments/finances">Finances</a><a href="/departments/content">Content &amp; social</a><a href="/departments/messages">Messages</a></div>
      <div><h2>Resources</h2><a href="/getting-started">Get started</a><a href="/how-to-use">How to use</a><a href="/docs">Documentation</a><a href="https://github.com/kwakuoseikwakye/alacran-releases" target="_blank" rel="noreferrer">GitHub</a></div>
      <div><h2>Company</h2><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:contact@alacran.app">Contact</a><a href="https://www.buymeacoffee.com/alacran" target="_blank" rel="noreferrer">Buy me a coffee</a></div>
    </nav>
  </div>
  <div class="foot-base"><p>Free app for macOS and Linux. Connected AI and third-party services may have separate charges.</p></div>
</div></footer>"""


def cta_row(s: str) -> str | None:
    """A paragraph that is only buttons, '**A** · **B** → `/x`', becomes a button row."""
    out = []
    for part in s.split(" · "):
        m = re.fullmatch(r"\*\*(.+?)\*\*(?: → `([^`]+)`)?", part.strip())
        if not m:
            return None
        label, href = m[1], m[2] or DEFAULT_ROUTES.get(m[1])
        if label == DOWNLOAD_LABEL and not href:
            out.append(dl_menu())
        elif href:
            out.append(f'<a class="btn btn-ghost" href="{href}">{e(label)}</a>')
        else:
            return None
    return f'<div class="actions">{"".join(out)}</div>'


def lone_link(s: str) -> bool:
    return bool(re.fullmatch(r"(?:Link: )?\*\*(.+?)\*\* → `([^`]+)`", s))


def cmd_block(cmd: str) -> str:
    """A command with a Copy button; the guide and the Mac dialog share it so they cannot drift."""
    return (f'<div class="cmd"><code>{html.escape(cmd, quote=False)}</code>'
            f'<button type="button" class="btn" data-copy title="Copy this line, then paste it into Terminal">Copy command</button></div>')


def prompt(label: str, quotes: list[str]) -> str:
    q = "".join(f"<p>{inl(x.strip('“”'))}</p>" for x in quotes)
    return f'<figure class="prompt"><figcaption>{e(label)}</figcaption><blockquote>{q}</blockquote></figure>'


def table(rows: list[list[str]]) -> str:
    head, body = rows[0], rows[1:]
    chips = all(", " in r[-1] for r in body)  # the connection catalogue
    th = "".join(f'<th scope="col">{inl(c)}</th>' for c in head)
    trs = []
    for r in body:
        last = ('<div class="chips">' + "".join(f'<span>{mark(MARKS[x], "c") if x in MARKS else ""}{inl(x)}</span>' for x in r[-1].split(", ")) + "</div>") if chips else inl(r[-1])
        cells = "".join(f'<th scope="row">{inl(c)}</th>' if j == 0 else f"<td>{last if j == len(r) - 1 else inl(c)}</td>"
                        for j, c in enumerate(r))
        trs.append(f"<tr>{cells}</tr>")
    return f'<div class="table-wrap{" is-catalogue" if chips else ""}"><table><thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'


def step(x: str) -> str:
    """One numbered step. Its content is a single box, so the grid sees the number and one cell, never one cell per inline piece.
    '... Command: `x`' puts the Copy box inside the step it belongs to."""
    m = re.match(r"^(.*?) Command: `(.+)`$", x)
    return f"<li><div>{inl(m[1]) + cmd_block(m[2]) if m else inl(x)}</div></li>"


def render_flow(bl: list[dict]) -> str:
    """Generic blocks -> HTML, used inside heroes, cards and plain sections."""
    out, i = [], 0
    while i < len(bl):
        b, t = bl[i], bl[i]["t"]
        if t == "p":
            s = b["s"]
            if row := cta_row(s):
                out.append(row)
            elif lone_link(s):
                out.append(f'<p class="more">{inl(s.removeprefix("Link: "))}</p>')
            elif s.endswith(":") and i + 1 < len(bl) and bl[i + 1]["t"] == "quote":
                quotes = []
                while i + 1 < len(bl) and bl[i + 1]["t"] == "quote":
                    i += 1
                    quotes.append(bl[i]["s"])
                out.append(prompt(s.rstrip(":"), quotes))
            elif m := re.match(r"^(First task to try): “(.+)”$", s):
                out.append(prompt(m[1], [m[2]]))
            elif m := re.match(r"^Command: `(.+)`$", s):
                out.append(cmd_block(m[1]))
            elif m := re.match(r"^(Eyebrow|Disclosure): \*\*(.+)\*\*$", s):
                out.append(f'<p class="{m[1].lower()}">{inl(m[2])}</p>')
            elif m := re.match(r"^\*\*(Try asking|You ask|You do):\*\* (.+)$", s):
                out.append(prompt(m[1], [m[2]]))
            elif m := re.match(r"^\*\*([^*]+?):\*\* (.+)$", s):
                out.append(f'<p class="lab"><span>{inl(m[1])}</span> {inl(m[2])}</p>')
            else:
                out.append(f"<p>{inl(s)}</p>")
        elif t == "quote":
            out.append(prompt("Try asking", [b["s"]]))
        elif t == "ul":
            out.append("<ul>" + "".join(f"<li>{inl(x)}</li>" for x in b["items"]) + "</ul>")
        elif t == "ol":
            out.append('<ol class="steps">' + "".join(step(x) for x in b["items"]) + "</ol>")
        elif t == "table":
            out.append(table(b["rows"]))
        elif t == "h1":
            out.append(f"<h1>{inl(b['s'])}</h1>")
        elif t == "h2":
            out.append(f"<h2>{inl(b['s'])}</h2>")
        elif t in ("h3", "h4"):
            out.append(f"<h3>{inl(b['s'])}</h3>")
        i += 1
    return "\n".join(out)


def is_q(b: dict) -> bool:
    return b["t"] == "p" and re.fullmatch(r"\*\*[^*]+\?\*\*", b["s"]) is not None


def faq(bl: list[dict]) -> str:
    items, open_q = [], None
    for b in bl:
        if is_q(b):
            open_q = [b["s"].strip("*"), []]
            items.append(open_q)
        elif open_q:
            open_q[1].append(b)
    return '<div class="faq">' + "".join(
        f'<details><summary>{inl(q)}<span class="plus" aria-hidden="true"></span></summary><div class="faq-a">{render_flow(a)}</div></details>'
        for q, a in items) + "</div>"


def lead_bold(b: dict):
    """'**A short sentence.** More text' -> (title, rest); bold-only -> (title, '')."""
    if b["t"] != "p":
        return None
    m = re.fullmatch(r"\*\*([^*]+?)\*\*(?: (.+))?", b["s"])
    if not m or m[1].endswith(":") or (m[2] or "").startswith("→"):
        return None
    return m[1], m[2] or ""


def cards(groups: list[tuple[str, list[dict]]]) -> str:
    out = []
    for n, (title, body) in enumerate(groups):
        title = re.sub(r"^\d+\. ", "", title)
        out.append(f'<article class="card" style="--i:{n}"><h3>{inl(title)}</h3>{render_flow(body)}</article>')
    cols = "cols-2" if len(groups) in (2, 4) else "cols-3"
    return f'<div class="cards {cols}">{"".join(out)}</div>'


def section_body(bl: list[dict]) -> str:
    """One section's blocks: intro, then cards, a FAQ, link cards or plain flow."""
    if any(is_q(b) for b in bl):
        first = next(i for i, b in enumerate(bl) if is_q(b))
        return render_flow(bl[:first]) + faq(bl[first:])
    h3s = [i for i, b in enumerate(bl) if b["t"] == "h3"]
    if len(h3s) >= 2:
        groups = [(bl[i]["s"], bl[i + 1:(h3s[k + 1] if k + 1 < len(h3s) else len(bl))]) for k, i in enumerate(h3s)]
        return render_flow(bl[:h3s[0]]) + cards(groups)
    leads = [i for i, b in enumerate(bl) if lead_bold(b)]
    if len(leads) >= 2:
        groups, tail = [], []
        for k, i in enumerate(leads):
            title, rest = lead_bold(bl[i])
            body = ([{"t": "p", "s": rest}] if rest else []) + bl[i + 1:(leads[k + 1] if k + 1 < len(leads) else len(bl))]
            if k == len(leads) - 1:
                # A closing link or button row after the last card belongs to the section.
                while body and body[-1]["t"] == "p" and (cta_row(body[-1]["s"]) or
                                                         (lone_link(body[-1]["s"]) and not body[-1]["s"].startswith("Link: "))):
                    tail.insert(0, body.pop())
            groups.append((title, body))
        return render_flow(bl[:leads[0]]) + cards(groups) + render_flow(tail)
    if len(bl) > 1 and all(b["t"] == "p" and lone_link(b["s"]) for b in bl):
        return '<div class="next">' + "".join(
            f'<a class="next-card" href="{re.search(r"`([^`]+)`", b["s"])[1]}"><span>{e(re.search(r"[*][*](.+?)[*][*]", b["s"])[1])}</span><b aria-hidden="true">→</b></a>'
            for b in bl) + "</div>"
    return render_flow(bl)


def groups_of(bl: list[dict]):
    """Blocks -> (intro, [(title, body)]), grouping on h3 or on bold lead-ins."""
    h3s = [i for i, b in enumerate(bl) if b["t"] == "h3"]
    if len(h3s) >= 2:
        return bl[:h3s[0]], [(bl[i]["s"], bl[i + 1:(h3s[k + 1] if k + 1 < len(h3s) else len(bl))]) for k, i in enumerate(h3s)]
    leads = [i for i, b in enumerate(bl) if lead_bold(b)]
    out = []
    for k, i in enumerate(leads):
        title, rest = lead_bold(bl[i])
        out.append((title, ([{"t": "p", "s": rest}] if rest else []) + bl[i + 1:(leads[k + 1] if k + 1 < len(leads) else len(bl))]))
    return bl[:leads[0]] if leads else bl, out


def split(bl: list[dict], level: str):
    idx = [i for i, b in enumerate(bl) if b["t"] == level]
    pre = bl[:idx[0]] if idx else bl
    return pre, [(bl[i], bl[i + 1:(idx[k + 1] if k + 1 < len(idx) else len(bl))]) for k, i in enumerate(idx)]


def head_of(bl: list[dict]) -> tuple[str, list[dict]]:
    h2 = next(b for b in bl if b["t"] == "h2")
    return f'<h2 data-split>{inl(h2["s"])}</h2>', [b for b in bl if b is not h2]


def sec_head(title: str, intro: list[dict]) -> str:
    return f'<div class="sec-head reveal">{title}{render_flow(intro)}</div>'


# ---------------------------------------------------------------- screenshots

NOTAB, LAZY = ' tabindex="-1"', ' loading="lazy"'
SCREENS = HERE / "screens"


def have(name: str) -> bool:
    return (SCREENS / f"{name}.webp").is_file() and (SCREENS / f"{name}-1200.webp").is_file()


def size(path: pathlib.Path) -> tuple[int, int]:
    from PIL import Image  # Pillow, which build-og.py already needs
    with Image.open(path) as im:
        return im.size


def build_details() -> None:
    """Cut each shot's phone crop from its full image, when the full image is newer."""
    from PIL import Image
    for name, (_, _, box) in SHOTS.items():
        src, out = SCREENS / f"{name}.webp", SCREENS / f"{name}-detail.webp"
        if not box or not src.is_file() or (out.is_file() and out.stat().st_mtime >= src.stat().st_mtime):
            continue
        with Image.open(src) as im:
            w, h = im.size
            crop = im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))
            if crop.width > 1000:
                crop = crop.resize((1000, round(crop.height * 1000 / crop.width)), Image.LANCZOS)
            crop.save(out, "WEBP", quality=84, method=6)
        print("cut", out.relative_to(HERE))


def shot_img(name: str, lazy: bool = True) -> str:
    alt = SHOTS[name][0]
    fw, _ = size(SCREENS / f"{name}.webp")
    w, h = size(SCREENS / f"{name}-1200.webp")
    img = (f'<img src="/screens/{name}-1200.webp" srcset="/screens/{name}-1200.webp {w}w, /screens/{name}.webp {fw}w" '
           f'sizes="(max-width: 1200px) 100vw, 1100px" width="{w}" height="{h}" alt="{e(alt)}"{LAZY if lazy else ""}>')
    detail = SCREENS / f"{name}-detail.webp"
    if SHOTS[name][2] and detail.is_file():
        dw, dh = size(detail)
        img = (f'<picture><source media="(max-width: 720px)" srcset="/screens/{name}-detail.webp" width="{dw}" height="{dh}">'
               f'{img}</picture>')
    return img


def zoom(name: str) -> str:
    """Opens the full screenshot in the page's dialog (v6.js)."""
    return (f'<button type="button" class="zoom" data-full="/screens/{name}.webp" data-alt="{e(SHOTS[name][0])}">'
            f'View full screenshot</button>')


WINDOW = '<div class="bar"><i></i><i></i><i></i><span>Alacrán</span></div>'


def shot_fig(name: str, lazy: bool = True) -> str:
    return (f'<figure class="shot reveal"><div class="shot-frame">{WINDOW}{shot_img(name, lazy)}</div>'
            f'<figcaption class="shot-foot"><span class="disclosure">{e(SHOTS[name][1])}</span>{zoom(name)}</figcaption></figure>')


# ---------------------------------------------------------------- hero illustration

C = 0.8660254          # cos 30: the isometric x step
OX, OY, S = 330, 252, 200   # screen origin of the stack's top corner, slab edge length
SH, SG = 30, 10        # slab height, gap between slabs
SLABS = [  # bottom to top: (label, file path shown on the right face, kind)
    ("Messages", "records/messages/", "w"),
    ("Content &amp; social", "records/content/", "w"),
    ("Finances", "records/finances/", "w"),
    ("Customers", "records/customers/", "w"),
    ("Company memory", "definitions/ notes/ docs/", "r"),
]
FACE = {"w": ("#fbfaf7", "#ebe8e1", "#d8d4ca", "#c6c1b5", "#17181c", "#5c5e67"),
        "r": ("#e22a3f", "#c41f33", "#9d1323", "#860e1d", "#ffffff", "rgba(255,255,255,.82)")}


def P(x: float, y: float, z: float = 0) -> tuple[float, float]:
    return OX + (x - y) * C, OY + (x + y) * 0.5 - z


def pts(*ps: tuple[float, float]) -> str:
    return " ".join(f"{a:.1f},{b:.1f}" for a, b in ps)


def rpath(points: list[tuple[float, float]], r: float = 12) -> str:
    """A polyline with its corners rounded, in screen coordinates."""
    def toward(a, b, d):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = (dx * dx + dy * dy) ** .5
        return a[0] + dx / n * d, a[1] + dy / n * d
    d = f"M{points[0][0]:.1f} {points[0][1]:.1f}"
    for k in range(1, len(points) - 1):
        a, c = toward(points[k], points[k - 1], r), toward(points[k], points[k + 1], r)
        d += f" L{a[0]:.1f} {a[1]:.1f} Q{points[k][0]:.1f} {points[k][1]:.1f} {c[0]:.1f} {c[1]:.1f}"
    return d + f" L{points[-1][0]:.1f} {points[-1][1]:.1f}"


def slab(i: int, label: str, sub: str, kind: str) -> str:
    top, left, right, edge, ink, ink2 = FACE[kind]
    z0 = i * (SH + SG)
    z1 = z0 + SH
    t = pts(P(0, 0, z1), P(S, 0, z1), P(S, S, z1), P(0, S, z1))
    l = pts(P(0, S, z1), P(S, S, z1), P(S, S, z0), P(0, S, z0))
    r = pts(P(S, 0, z1), P(S, S, z1), P(S, S, z0), P(S, 0, z0))
    (lx, ly), (rx, ry) = P(0, S, z0), P(S, S, z0)
    extra = ""
    if kind == "r":
        cx, cy = P(S / 2, S / 2, z1)
        extra = (f'<image href="/mark-white.png" x="-70" y="-73" width="140" height="146" transform="translate({cx:.1f} {cy:.1f}) scale(1 .577)"/>'
                 f'<g class="glow" fill="#fff"><polygon points="{t}"/><polygon points="{l}"/><polygon points="{r}"/></g>')
    return (f'<g class="slab" style="--i:{i}">'
            f'<polygon points="{l}" fill="{left}" stroke="{edge}" stroke-width=".8" stroke-linejoin="round"/>'
            f'<polygon points="{r}" fill="{right}" stroke="{edge}" stroke-width=".8" stroke-linejoin="round"/>'
            f'<polygon points="{t}" fill="{top}" stroke="{edge}" stroke-width=".8" stroke-linejoin="round"/>'
            f'<text class="t-label" fill="{ink}" transform="matrix({C} .5 0 1 {lx:.1f} {ly:.1f})" x="16" y="-10.5">{label}</text>'
            f'<text class="t-mono" fill="{ink2}" transform="matrix({C} -.5 0 1 {rx:.1f} {ry:.1f})" x="16" y="-11">{sub}</text>'
            f'{extra}</g>')


def hero_art() -> str:
    slabs = "".join(slab(i, *s) for i, s in enumerate(SLABS))
    grid = "".join(
        f'<line x1="{P(-120, k)[0]:.1f}" y1="{P(-120, k)[1]:.1f}" x2="{P(380, k)[0]:.1f}" y2="{P(380, k)[1]:.1f}"/>'
        f'<line x1="{P(k, -120)[0]:.1f}" y1="{P(k, -120)[1]:.1f}" x2="{P(k, 380)[0]:.1f}" y2="{P(k, 380)[1]:.1f}"/>'
        for k in range(-100, 381, 50))
    shadow = pts(P(-14, -14), P(S + 14, -14), P(S + 14, S + 14), P(-14, S + 14))
    inp = [P(40, 400), P(40, 300), P(110, 300), P(110, S)]
    outp = [P(S, 100), P(330, 100), P(330, 30)]
    din, dout = rpath(inp), rpath(outp)
    gx, gy = outp[-1]
    return f"""<svg class="art" viewBox="0 30 720 470" role="img" aria-label="Illustration: an AI agent carries a task to a stack of company departments, a draft for review appears, the owner approves it, and the change is saved to history.">
<defs>
<radialGradient id="art-fg" cx="46%" cy="52%" r="55%"><stop offset=".3" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<mask id="art-fade"><rect x="-200" y="-100" width="1100" height="900" fill="url(#art-fg)"/></mask>
<filter id="art-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="art-sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#17181c" flood-opacity=".14"/></filter>
</defs>
<g mask="url(#art-fade)" stroke="#e4e0d7" stroke-width="1" fill="none">{grid}</g>
<polygon points="{shadow}" fill="#17181c" opacity=".1" filter="url(#art-blur)"/>
<g class="drift">
<path d="{din}" fill="none" stroke="#cdc8bd" stroke-width="2.4" stroke-linecap="round"/>
<path class="flow" d="{din}"/>
<path d="{dout}" fill="none" stroke="#cdc8bd" stroke-width="2.4" stroke-linecap="round"/>
<path class="flow flow-out" d="{dout}"/>
<circle cx="{inp[0][0]:.1f}" cy="{inp[0][1]:.1f}" r="5" fill="#f4f2ee" stroke="#9a958a" stroke-width="1.6"/>
<circle cx="{outp[0][0]:.1f}" cy="{outp[0][1]:.1f}" r="4" fill="#9a958a"/>
<circle cx="{gx:.1f}" cy="{gy:.1f}" r="7" fill="#fff" stroke="#9a958a" stroke-width="1.6"/>
<circle class="saved" cx="{gx:.1f}" cy="{gy:.1f}" r="4.2" fill="#d6202f"/>
<text class="t-mono saved" x="{gx + 15:.1f}" y="{gy + 4:.1f}" fill="#a81424">Saved to history</text>
{slabs}
<g class="chip"><g><animateMotion dur="10s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;.06;.34;1" path="{din}"/>
<g transform="translate(-45 -13)"><rect width="90" height="26" rx="13" fill="#fff" stroke="#d6202f" stroke-width="1.3"/><circle cx="14" cy="13" r="4" fill="#d6202f"/><text x="26" y="17.4" font-size="12" font-weight="500" fill="#17181c">AI agent</text></g></g></g>
</g>
<g transform="translate(502 70)"><g class="card" filter="url(#art-sh)">
<rect width="214" height="178" rx="12" fill="#fff" stroke="#e3dfd7"/>
<text x="16" y="26" font-family="JetBrains Mono, monospace" font-size="10.5" fill="#5c5e67">Draft for review · Example</text>
<text x="16" y="48" font-size="13" font-weight="600" fill="#17181c">Follow-up: Northstar Café</text>
<rect x="16" y="62" width="182" height="24" rx="5" fill="#fbe9eb"/><text x="24" y="78" font-family="JetBrains Mono, monospace" font-size="11" fill="#a81424">- Reply by Friday</text>
<rect x="16" y="90" width="182" height="24" rx="5" fill="#e6f0e8"/><text x="24" y="106" font-family="JetBrains Mono, monospace" font-size="11" fill="#1f5a35">+ Reply by Thursday</text>
<rect x="16" y="118" width="182" height="24" rx="5" fill="#e6f0e8"/><text x="24" y="134" font-family="JetBrains Mono, monospace" font-size="11" fill="#1f5a35">+ Menu attached</text>
<rect class="approve" x="16" y="148" width="72" height="22" rx="6" fill="#d6202f"/><text x="52" y="163" text-anchor="middle" font-size="11.5" font-weight="500" fill="#fff">Approve</text>
<rect x="96" y="148" width="102" height="22" rx="6" fill="#fff" stroke="#d2cdc2"/><text x="147" y="163" text-anchor="middle" font-size="11.5" font-weight="500" fill="#17181c">Ask for changes</text>
</g></g>
<g transform="translate(626 262)"><g class="stamp"><rect x="-56" y="-17" width="112" height="34" rx="4" fill="#fff" fill-opacity=".9" stroke="#a81424" stroke-width="2.4"/><text y="6" text-anchor="middle" font-size="17" font-weight="700" letter-spacing="2" fill="#a81424">APPROVED</text></g></g>
</svg>"""


# ---------------------------------------------------------------- home

# The draft card as HTML, shown under the stack on phones where the SVG's own card would be too small to read.
ART_CARD = ('<div class="art-card" aria-hidden="true"><div class="ac-card"><small>Draft for review · Example</small><b>Follow-up: Northstar Café</b>'
            '<p class="del">- Reply by Friday</p><p class="add">+ Reply by Thursday</p><p class="add">+ Menu attached</p>'
            '<div class="ac-btns"><span class="ac-ok">Approve</span><span>Ask for changes</span></div></div><span class="ac-stamp">APPROVED</span></div>')


def hero(bl: list[dict]) -> str:
    h1 = next(b["s"] for b in bl if b["t"] == "h1")
    ps = [b["s"] for b in bl if b["t"] == "p" and not b["s"].startswith("Eyebrow")]
    lede = ps[0]
    row = next(cta_row(s) for s in ps if cta_row(s))
    fine = next(s for s in ps[1:] if not cta_row(s))
    return f"""<section class="hero" id="overview"><div class="wrap hero-grid">
<div class="hero-copy"><h1 data-split>{inl(h1)}</h1><p class="lede reveal">{inl(lede)}</p>{row}<p class="fine reveal">{inl(fine)}</p></div>
<div class="hero-art">{hero_art()}{ART_CARD}<button class="art-pause motion-toggle" type="button">Pause animation</button></div>
</div></section>"""


def tour(g: dict, bl: list[dict]) -> str:
    h2 = next(b for b in bl if b["t"] == "h2")
    intro = next(b for b in bl if b["t"] == "p")["s"]
    items = next(b for b in bl if b["t"] == "ul")["items"]
    disc = re.search(r"[*][*](.+)[*][*]", next(b for b in bl if b["t"] == "p" and b["s"].startswith("Disclosure"))["s"])[1]
    steps = []  # (tab label, shot, caption, disclosure)
    missing = [n for n in TOUR_SHOTS if not have(n)]
    if not missing:
        for item, shot in zip(items, TOUR_SHOTS):
            m = re.match(r"\*\*(.+?):\*\* (.+)", item)
            steps.append((m[1], shot, m[2], disc))
    else:
        print("tour: interim mode, missing captures:", ", ".join(f"screens/{n}.webp" for n in missing))
        intro = TOUR_INTERIM_INTRO
        for item in items:
            label = re.match(r"\*\*(.+?):\*\*", item)[1]
            if label in TOUR_INTERIM:
                shot, cap = TOUR_INTERIM[label]
                steps.append((label, shot, cap, disc))
    tabs, panels = [], []
    for n, (label, shot, cap, note) in enumerate(steps):
        first = n == 0
        tabs.append(f'<button type="button" role="tab" id="tt-{n}" aria-controls="tp-{n}" aria-selected="{str(first).lower()}"'
                    f'{"" if first else NOTAB}>{inl(label)}</button>')
        panels.append(f'<div role="tabpanel" id="tp-{n}" aria-labelledby="tt-{n}" class="tour-panel"{"" if first else " hidden"}>'
                      f'<div class="tour-media">{shot_img(shot, lazy=not first)}</div>'
                      f'<div class="tour-cap"><p>{inl(cap)}</p><p class="shot-foot"><span class="disclosure">{e(note)}</span>{zoom(shot)}</p></div></div>')
    return f"""<section class="sec tour" id="{g['id']}"><div class="wrap">
  <div class="sec-head reveal"><h2 data-split>{inl(h2['s'])}</h2><p class="lede">{inl(intro)}</p></div>
  <div class="tabs reveal" role="tablist" aria-label="Product tour">{''.join(tabs)}</div>
  <figure class="shot shot-tour reveal"><div class="shot-frame">{WINDOW}{''.join(panels)}</div></figure>
</div></section>"""


def features(bl: list[dict], sid: str = "features", cls: str = "") -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    tail = []
    last_t, last_b = groups[-1]
    if last_b and last_b[-1]["t"] == "p" and lone_link(last_b[-1]["s"]):  # a closing link belongs to the section
        tail, groups[-1] = [last_b[-1]], (last_t, last_b[:-1])
    cols = "".join(f'<article class="reveal" style="--i:{n}"><h3>{inl(t)}</h3>{render_flow(b)}</article>' for n, (t, b) in enumerate(groups))
    more = f'<div class="how-more">{render_flow(tail)}</div>' if tail else ""
    return f'<section class="sec" id="{sid}"><div class="wrap">{sec_head(title, intro)}<div class="feat{cls}">{cols}</div>{more}</div></section>'


def scenarios(bl: list[dict]) -> str:
    """Numbered real situations: what you ask, what you get, how you stay in control."""
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    items = "".join(f'<li class="scn reveal"><h3>{inl(re.sub(r"^[0-9]+[.] ", "", t))}</h3><div class="scn-body">{render_flow(b)}</div></li>'
                    for t, b in groups)
    return f'<section class="sec scn-sec" id="scenarios"><div class="wrap">{sec_head(title, intro)}<ol class="scn-list">{items}</ol></div></section>'


def depts(bl: list[dict]) -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    rows = []
    for n, (t, body) in enumerate(groups):
        link = [b for b in body if b["t"] == "p" and lone_link(b["s"])]
        text = [b for b in body if b not in link]
        more = f'<p class="more">{inl(link[0]["s"].removeprefix("Link: "))}</p>' if link else ""
        rows.append(f'<article class="dept-row reveal" id="dept-{n}"><h3>{inl(t)}</h3><div>{render_flow(text)}</div>{more}</article>')
    return f'<section class="sec" id="departments"><div class="wrap">{sec_head(title, intro)}<div class="dept-list">{"".join(rows)}</div></div></section>'


def how(bl: list[dict]) -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    tail = []
    last_t, last_b = groups[-1]
    if last_b and last_b[-1]["t"] == "p" and lone_link(last_b[-1]["s"]):
        tail, groups[-1] = [last_b[-1]], (last_t, last_b[:-1])
    steps = "".join(
        f'<article class="reveal" style="--i:{n}"><h3>{inl(re.sub(r"^[0-9]+[.] ", "", t))}</h3>{render_flow(b)}</article>'
        for n, (t, b) in enumerate(groups))
    return f'<section class="sec" id="how"><div class="wrap">{sec_head(title, intro)}<div class="how">{steps}</div><div class="how-more">{render_flow(tail)}</div></div></section>'


def agents_list() -> str:
    items = "".join(f"<li>{mark(MARKS[n]) if n in MARKS else ''}{n}</li>" for n in AGENTS)
    return f'<ul class="agents">{items}</ul>'.replace("<li>", '<li class="on">', 1)


VISUALS = {
    "Multiple companies": '<small>Switch workspaces without rebuilding your setup</small>' + "".join(
        f'<div class="space{" on" if n == 0 else ""}"><b>{t}</b><small>Workspace</small></div>'
        for n, t in enumerate(("Example company", "Second venture", "Client project"))),
    "Ownership": '<small>Example company · plain files on your computer</small>' + "".join(
        f'<div class="file">{f}<span>{d}</span></div>' for f, d in (
            ("definitions/", "company facts"), ("notes/", "working notes"), ("docs/decisions/", "the reasoning"),
            ("records/", "department data"), ("AGENTS.md", "working rules"))) +
        '<div class="commit"><b>Approved:</b> follow-up draft saved to history</div>',
    "Flexible agents": '<small>Same files, any agent</small>' + agents_list(),
}


def split_section(name: str, sid: str, bl: list[dict], flip: bool) -> str:
    title, rest = head_of(bl)
    return (f'<section class="sec" id="{sid}"><div class="wrap split-row{" flip" if flip else ""}">'
            f'<div class="split-copy reveal">{title}{render_flow(rest)}</div>'
            f'<div class="split-vis reveal"><div class="vis" aria-hidden="true">{VISUALS[name]}</div></div></div></section>')


def cta_section(bl: list[dict]) -> str:
    h2 = next(b for b in bl if b["t"] == "h2")
    rest = [b for b in bl if b is not h2]
    # The watermark sits in its own clipping box, first, so it paints behind the content and the card itself never clips the menu.
    return (f'<section class="cta"><div class="wrap"><div class="cta-card reveal">'
            f'<div class="cta-art" aria-hidden="true"><img class="cta-mark" src="/mark-white.png" width="300" height="313" alt=""></div>'
            f'<h2>{inl(h2["s"])}</h2>{render_flow(rest)}</div></div></section>')


def build_home(p: dict) -> str:
    _, groups = split(p["blocks"], "h4")
    out, faq_ld = [], []
    flip = False
    for g, bl in groups:
        name = g["s"]
        if name == "Hero":
            out.append(hero(bl))
        elif name.startswith("Product tour"):
            out.append(tour(g, bl))
        elif name == "Why":
            out.append(features(bl, "why", " three"))
        elif name == "Benefits":
            out.append(features(bl))
        elif name == "Scenarios":
            out.append(scenarios(bl))
        elif name == "Departments":
            out.append(depts(bl))
        elif name == "How it works":
            out.append(how(bl))
        elif name == "Final call to action":
            out.append(cta_section(bl))
        elif name in VISUALS:
            sid = {"Multiple companies": "companies", "Ownership": "ownership", "Flexible agents": "agents"}[name]
            out.append(split_section(name, sid, bl, flip))
            flip = not flip
        elif name.startswith("FAQ"):
            q = None
            for b in bl:
                if is_q(b):
                    q = {"@type": "Question", "name": b["s"].strip("*"), "acceptedAnswer": {"@type": "Answer", "text": ""}}
                    faq_ld.append(q)
                elif q and b["t"] == "p":
                    q["acceptedAnswer"]["text"] = (q["acceptedAnswer"]["text"] + " " + b["s"]).strip()
            out.append(f'<section class="sec" id="{g["id"] or "faq"}"><div class="wrap faq-grid">'
                       f'<div class="sec-head reveal"><h2 data-split>{e(name)}</h2></div><div class="reveal">{faq(bl)}</div></div></section>')
        else:
            raise SystemExit(f"unknown home section: {name}")
    ld = [{"@type": "SoftwareApplication", "name": "Alacrán", "url": f"{SITE}/", "description": p["desc"],
           "applicationCategory": "BusinessApplication", "operatingSystem": "macOS, Debian, Ubuntu",
           "downloadUrl": "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest",
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "publisher": {"@id": f"{SITE}/#org"}},
          {"@type": "FAQPage", "mainEntity": faq_ld}]
    return page(p, "\n".join(out), ld, "home")


# ---------------------------------------------------------------- inner pages

def plain(s: str) -> str:
    return re.sub(r"<[^>]+>", "", inl(s))


def slug(s: str, seen: set) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", plain(s).lower()).strip("-") or "section"
    out, n = base, 2
    while out in seen:
        out, n = f"{base}-{n}", n + 1
    seen.add(out)
    return out


def phead(pre: list[dict], route: str, shot: str | None = None) -> str:
    crumb = meta = h1 = lede = actions = ""
    extra: list[str] = []
    for b in pre:
        if b["t"] == "h1":
            h1 = f"<h1>{inl(b['s'])}</h1>"
        elif b["t"] == "p":
            s = b["s"]
            if m := re.match(r"^Eyebrow: \*\*(.+)\*\*$", s):
                if route.startswith("/departments/"):
                    crumb = f'<p class="crumb"><a href="/">Home</a> / <a href="/#departments">Departments</a> / {e(m[1].split(" / ")[-1])}</p>'
                elif " / " in m[1]:
                    meta = f'<p class="meta">{e(m[1].split(" / ", 1)[1])}</p>'
            elif row := cta_row(s):
                actions = row
            elif not lede:
                lede = f'<p class="lede">{inl(s)}</p>'
            else:
                extra.append(f"<p>{inl(s)}</p>")
        else:
            extra.append(render_flow([b]))
    copy = f'<div class="phead-copy">{crumb}{h1}{lede}{"".join(extra)}{meta}{actions}</div>'
    if shot:
        return f'<section class="phead"><div class="wrap dept-hero">{copy}{shot_fig(shot, lazy=False)}</div></section>'
    return f'<section class="phead"><div class="wrap">{copy}</div></section>'


def side_nav(route: str) -> str:
    groups = LEGAL_SIDE if route in LEGAL else SIDE
    out = []
    for name, links in groups:
        on = any(h == route for h, _ in links)
        items = "".join(f'<li><a href="{h}"{cur(h, route)}>{label}</a></li>' for h, label in links)
        out.append(f'<div class="grp{" cur" if on else ""}"><h2>{name}</h2><ul>{items}</ul></div>')
    return f'<nav class="side" aria-label="Site pages">{"".join(out)}</nav>'


def docs_layout(p: dict, pre: list[dict], secs: list, cta: list[dict]) -> str:
    route = p["route"]
    seen: set = set()
    body, toc = [], []
    for h, bl in secs:
        sid = h["id"] or slug(h["s"], seen)
        seen.add(sid)
        shot = shot_fig(SECTION_SHOTS[(route, h["s"])]) if (route, h["s"]) in SECTION_SHOTS else ""
        body.append(f'<section id="{sid}"><h2>{inl(h["s"])}</h2>{section_body(bl)}{shot}</section>')
        toc.append(f'<li data-t="{sid}"><a href="#{sid}">{plain(h["s"])}</a></li>')
    missing = {k for k in SECTION_SHOTS if k[0] == route} - {(route, h["s"]) for h, _ in secs}
    if missing:
        raise SystemExit(f"SECTION_SHOTS names a heading the copy no longer has: {sorted(missing)}")
    out = [phead(pre, route, HERO_SHOTS.get(route)),
           f'<div class="wrap docs">{side_nav(route)}<article class="prose">{"".join(body)}</article>'
           f'<aside class="toc" aria-label="On this page"><h2>On this page</h2><ul>{"".join(toc)}</ul></aside></div>']
    out.append(cta_section(cta))
    return "\n".join(out)


def packs_layout(p: dict, pre: list[dict], secs: list, cta: list[dict]) -> str:
    cards_, rest = [], []
    for h, bl in secs:
        (cards_ if any(b["t"] == "p" and b["s"].startswith("First task to try") for b in bl) else rest).append((h, bl))
    grid = "".join(f'<article class="pack reveal" style="--i:{n % 3}"><h2>{inl(h["s"])}</h2>{render_flow(bl)}</article>' for n, (h, bl) in enumerate(cards_))
    tail = "".join(f'<section class="prose-tail"><h2 class="page-h2">{inl(h["s"])}</h2>{section_body(bl)}</section>' for h, bl in rest)
    return "\n".join([phead(pre, p["route"]), f'<div class="wrap"><div class="packs">{grid}</div></div>',
                      f'<div class="wrap tail"><div class="prose">{tail}</div></div>', cta_section(cta)])


def cases_layout(p: dict, pre: list[dict], secs: list, cta: list[dict]) -> str:
    seen: set = set()
    rows, rest = [], []
    for h, bl in secs:
        if any(b["t"] == "p" and b["s"].startswith("**The situation:**") for b in bl):
            sid = h["id"] or slug(h["s"], seen)
            seen.add(sid)
            rows.append(f'<article class="case reveal" id="{sid}"><div><h2>{inl(h["s"])}</h2></div><div class="case-body">{render_flow(bl)}</div></article>')
        else:
            rest.append((h, bl))
    tail = "".join(f'<section class="prose-tail"><h2 class="page-h2">{inl(h["s"])}</h2>{section_body(bl)}</section>' for h, bl in rest)
    return "\n".join([phead(pre, p["route"]), f'<div class="wrap cases">{"".join(rows)}</div>',
                      f'<div class="wrap tail"><div class="prose">{tail}</div></div>', cta_section(cta)])


def build_sub(p: dict, cta: list[dict]) -> str:
    pre, secs = split(p["blocks"], "h2")
    route = p["route"]
    legal = route in LEGAL
    if legal and pre and pre[1:] and pre[0]["t"] == "p" and " / " in pre[0]["s"]:
        pre = [{"t": "p", "s": f"Eyebrow: **{pre[0]['s']}**"}] + pre[1:]
    layout = {"packs": packs_layout, "cases": cases_layout}.get(GALLERY.get(route, ""), docs_layout)
    return page(p, layout(p, pre, secs, cta), [], "legal" if legal else "sub")


# ---------------------------------------------------------------- page shell

def head(p: dict, extra_ld: list) -> str:
    url = SITE + ("/" if p["route"] == "/" else p["route"])
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Organization", "@id": f"{SITE}/#org", "name": "Alacrán", "url": f"{SITE}/", "logo": f"{SITE}/logo.png", "slogan": "The agentic business environment"},
        {"@type": "WebPage", "url": url, "name": p["title"], "description": p["desc"]}] + extra_ld}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(p["title"])}</title>
  <meta name="description" content="{e(p["desc"])}">
  <meta name="theme-color" content="#f4f2ee">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Alacrán">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{e(p["title"])}">
  <meta property="og:description" content="{e(p["desc"])}">
  <meta property="og:image" content="{OG_IMAGE}">
  <meta property="og:image:secure_url" content="{OG_IMAGE}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{OG_ALT}">
  <meta property="og:locale" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(p["title"])}">
  <meta name="twitter:description" content="{e(p["desc"])}">
  <meta name="twitter:image" content="{OG_IMAGE}">
  <meta name="twitter:image:alt" content="{OG_ALT}">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
  <link rel="icon" href="/favicon.png" sizes="128x133" type="image/png">
  <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <link rel="preload" href="/fonts/onest.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/v6.css">
  <script src="/v6.js" defer></script>
  <script src="/brands.js" defer></script>
</head>"""


DIALOG = """<dialog class="viewer" aria-label="Full screenshot">
  <form method="dialog" class="viewer-bar"><button class="btn btn-ghost viewer-close" value="close">Close</button></form>
  <img alt="">
</dialog>"""

MAC_CMD = 'xattr -cr "/Applications/Alacran.app"'
MAC_SCOPE = "Use it only on the app you downloaded from this site or the official releases page."
MAC_DIALOG = f"""<dialog class="mac-help" aria-labelledby="mac-title">
  <form method="dialog" class="viewer-bar"><button class="btn btn-ghost viewer-close" value="close">Close</button></form>
  <div class="mac-body">
    <h2 id="mac-title">Your download has started. One more step on a Mac.</h2>
    <p class="lede">Apple has not notarized Alacrán, because that needs a paid Apple Developer account. Until you do this once, macOS may block the app, often with the message "Alacrán is damaged and can't be opened". It is not damaged.</p>
    <ol class="mac-steps">
      <li><b>Install.</b> Open the downloaded <code>.dmg</code> and drag Alacrán into Applications.</li>
      <li><b>Run this in Terminal, once.</b> It clears the quarantine flag macOS puts on downloaded files. {MAC_SCOPE}
        {cmd_block(MAC_CMD)}
      </li>
      <li><b>Open Alacrán</b> from Applications.</li>
    </ol>
    <p class="fine">You only need this for the first install. Updates inside the app do not need it. Prefer to read more? <a href="/getting-started">Read the setup guide</a>.</p>
  </div>
</dialog>"""


def page(p: dict, main: str, ld: list, kind: str) -> str:
    return f"""{head(p, ld)}
<body class="{kind}">
<a class="skip" href="#main">Skip to content</a>
{nav(p['route'])}
<main id="main">
{main}
</main>
{FOOTER}
{DIALOG if 'class="zoom"' in main else ''}
{MAC_DIALOG}
{BMC}
</body>
</html>
"""


def main():
    src = SRC.read_text(encoding="utf-8")
    shared = re.search(r"^### Shared call to action$(.*?)(?=^### )", src, re.M | re.S)[1]
    cta = [{"t": "h2", "s": "Put your business knowledge to work."}] + [
        b for b in blocks(shared) if not (b["t"] == "p" and b["s"].startswith("**Put your"))]
    build_details()
    for p in read_pages(src):
        doc = build_home(p) if p["route"] == "/" else build_sub(p, cta)
        target = HERE / ("index.html" if p["route"] == "/" else p["route"].strip("/") + "/index.html")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(doc, encoding="utf-8")
        print("built", target.relative_to(HERE))


if __name__ == "__main__":
    main()
