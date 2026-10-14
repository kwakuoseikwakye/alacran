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
# build_details() cuts it to <name>-detail.webp. Sample-company shots carry the
# copy's disclosure; shots of Alacrán's own workspace say so instead, because
# "Sample data" would be false on them.
SAMPLE, OWN = "Example company · Sample data", "Alacrán's own workspace"
SHOTS = {
    "content": ("Content and social screen with approved post drafts for an example company", SAMPLE, (.22, .11, .71, .96)),
    "memory": ("Company memory map linking definitions, decisions, records and agents", SAMPLE, (.2, .27, .98, .93)),
    "finances": ("Finances screen showing cash on hand, monthly burn and estimated runway for an example company", SAMPLE, (.2, .27, .97, .9)),
    "office-dark": ("Home screen greeting with one item needing attention, a 3D office showing which agents are working, a change ready for review, and the voice assistant open beside it", OWN, (.17, .28, .7, .93)),
    "office-light": ("Home screen in the light theme: the agent office, one agent waiting for approval, and a session summary ready to review", OWN, (.32, .3, .82, .93)),
    "approvals": ("Approvals screen with one pending review marked high risk, listing files the run changed outside its own folder", OWN, (.32, .15, 1, 1)),
    "departments": ("Departments screen listing each department with its record files, and the people who sign off on changes", OWN, (.14, .1, .99, .75)),
    "workflows": ("Workflows screen with daily cadence and governance workflows, each with Run in Terminal and Prepare draft buttons", OWN, (.14, .12, .99, .75)),
    "preferences": ("Preferences screen where you name the assistant, choose the languages you each speak, and pick its voice", OWN, (.38, .2, .76, .85)),
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
AGENT_MARKS = [("claude", "Claude Code"), ("google-antigravity", "Google Antigravity"),
               ("kiro", "Kiro"), ("kimi", "Kimi"), (None, "Codex")]


def e(s: str) -> str:
    return html.escape(s, quote=True)


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
            "blocks": blocks(re.search(r"^### Website copy.*?$(.*?)(?=^### (?:Implementation notes|Release checks)|^## .*not website copy|\Z)", body, re.M | re.S)[1]),
        })
    return pages


# ---------------------------------------------------------------- pieces

def dl_menu(cls: str = "") -> str:
    items = "".join(
        f'<a href="{DL}{f}" download><strong>{n}</strong><small>{d}</small><span class="tag">.{f.rsplit(".", 1)[1]}</span></a>'
        for f, n, d in DOWNLOADS)
    return (f'<details class="dl {cls}"><summary class="btn btn-primary">{DOWNLOAD_LABEL}<span class="caret" aria-hidden="true"></span></summary>'
            f'<div class="menu">{items}<a class="menu-foot" href="/getting-started">Read the setup guide <span aria-hidden="true">→</span></a></div></details>')


def cur(href: str, route: str) -> str:
    return ' aria-current="page"' if href == route else ""


def nav(route: str) -> str:
    links = "".join(f'<a href="{h}"{cur(h, route)}>{label}</a>' for h, label in NAV)
    on = ' class="is-current"' if any(h == route for h, *_ in GUIDES) else ""
    guides = "".join(f'<a href="{h}"{cur(h, route)}><strong>{label}</strong><small>{d}</small></a>' for h, label, d in GUIDES)
    return f"""<header class="nav" id="top">
  <a class="brand" href="/" aria-label="Alacrán home"><i class="mk" aria-hidden="true"></i><span>Alacrán</span></a>
  <nav class="nav-links" id="navlinks" aria-label="Main navigation">{links}<details class="guides"><summary{on}>Guides<span class="caret" aria-hidden="true"></span></summary><div class="menu">{guides}</div></details><button class="motion-toggle" type="button">Pause motion</button></nav>
  {dl_menu("dl-nav")}
  <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="navlinks" aria-label="Menu"><span></span><span></span></button>
</header>"""


FOOTER = """<footer class="foot">
  <div class="foot-top">
    <div class="foot-brand">
      <a class="brand" href="/"><i class="mk" aria-hidden="true"></i><span>Alacrán</span></a>
      <p class="foot-tag">Your business knowledge. Your AI. Your workspace.</p>
      <p>Alacrán brings business records, AI workflows, and human review together on your desktop.</p>
    </div>
    <nav class="foot-cols" aria-label="Footer">
      <div><h2>Product</h2><a href="/#features">Features</a><a href="/templates">Starter packs</a><a href="/integrations">Integrations</a><a href="/use-cases">Use cases</a></div>
      <div><h2>Departments</h2><a href="/departments/customers">Customers</a><a href="/departments/finances">Finances</a><a href="/departments/content">Content &amp; social</a><a href="/departments/messages">Messages</a></div>
      <div><h2>Resources</h2><a href="/getting-started">Get started</a><a href="/how-to-use">How to use</a><a href="/docs">Documentation</a><a href="https://github.com/kwakuoseikwakye/alacran-releases" target="_blank" rel="noreferrer">GitHub</a></div>
      <div><h2>Company</h2><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:contact@alacran.app">Contact</a></div>
    </nav>
  </div>
  <p class="foot-note">Free app for macOS and Linux. Connected AI and third-party services may have separate charges.</p>
  <p class="foot-word" aria-hidden="true">ALACRÁN</p>
</footer>"""


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


def prompt(label: str, quotes: list[str]) -> str:
    q = "".join(f"<p>{inl(x.strip('“”'))}</p>" for x in quotes)
    return f'<figure class="prompt" data-tilt><figcaption>{e(label)}</figcaption><blockquote>{q}</blockquote></figure>'


def table(rows: list[list[str]]) -> str:
    head, body = rows[0], rows[1:]
    chips = all(", " in r[-1] for r in body)  # the connection catalogue
    th = "".join(f'<th scope="col">{inl(c)}</th>' for c in head)
    trs = []
    for r in body:
        last = ('<div class="chips">' + "".join(f"<span>{inl(x)}</span>" for x in r[-1].split(", ")) + "</div>") if chips else inl(r[-1])
        cells = "".join(f'<th scope="row">{inl(c)}</th>' if j == 0 else f"<td>{last if j == len(r) - 1 else inl(c)}</td>"
                        for j, c in enumerate(r))
        trs.append(f"<tr>{cells}</tr>")
    return f'<div class="table-wrap{" is-catalogue" if chips else ""}"><table><thead><tr>{th}</tr></thead><tbody>{"".join(trs)}</tbody></table></div>'


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
            elif m := re.match(r"^(Eyebrow|Disclosure): \*\*(.+)\*\*$", s):
                out.append(f'<p class="{m[1].lower()}">{inl(m[2])}</p>')
            elif m := re.match(r"^\*\*([^*]+?):\*\* (.+)$", s):
                out.append(f'<p class="lab"><span>{inl(m[1])}</span> {inl(m[2])}</p>')
            else:
                out.append(f"<p>{inl(s)}</p>")
        elif t == "quote":
            out.append(prompt("Try asking", [b["s"]]))
        elif t == "ul":
            out.append("<ul>" + "".join(f"<li>{inl(x)}</li>" for x in b["items"]) + "</ul>")
        elif t == "ol":
            out.append('<ol class="steps">' + "".join(f"<li>{inl(x)}</li>" for x in b["items"]) + "</ol>")
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
        badge = ""
        if m := re.match(r"^(\d+)\. (.+)$", title):
            badge, title = f'<span class="num">{m[1].zfill(2)}</span>', m[2]
        out.append(f'<article class="card" data-tilt style="--i:{n}">{badge}<h3>{inl(title)}</h3>{render_flow(body)}</article>')
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
            f'<a class="next-card" data-tilt href="{re.search(r"`([^`]+)`", b["s"])[1]}"><span>{e(re.search(r"[*][*](.+?)[*][*]", b["s"])[1])}</span><b aria-hidden="true">→</b></a>'
            for b in bl) + "</div>"
    return render_flow(bl)


# ---------------------------------------------------------------- 3D visuals

def stack(labels: list[str], top: str | None = None) -> str:
    """Layered glass panes floating in depth, labelled with the page's own sections."""
    panes = [f'<div class="pane" style="--z:{n}"><small>{n + 1:02d}</small><b>{inl(label)}</b><i></i><i class="short"></i></div>'
             for n, label in enumerate(labels[:4])]
    if top:
        panes.append(f'<div class="pane pane-top" style="--z:{len(panes)}"><small>Draft for review</small><b>{e(top)}</b><span class="pane-btns"><em>Approve</em><em>Ask for changes</em></span></div>')
    return f'<div class="stage" aria-hidden="true"><div class="stack"><div class="floor"></div>{"".join(panes)}</div></div>'


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
    """Opens the full screenshot in the page's dialog (v4.js)."""
    return (f'<button type="button" class="zoom" data-full="/screens/{name}.webp" data-alt="{e(SHOTS[name][0])}">'
            f'View full screenshot</button>')


def shot3d(name: str, cls: str = "") -> str:
    return (f'<figure class="shot {cls}" data-scroll3d><div class="shot-frame"><div class="bar"><i></i><i></i><i></i><span>Alacrán</span></div>'
            f'{shot_img(name, lazy=cls != "shot-hero")}</div>'
            f'<figcaption class="shot-foot"><span class="disclosure">{e(SHOTS[name][1])}</span>{zoom(name)}</figcaption></figure>')


CHIPS = [  # x%, y%, tilt, depth, extra class, label, title, line (illustrative, shown as "Example company")
    (10, 25, -6, 1.0, "need", "Messages", "Customer inquiry", "Reply waiting for you"),
    (77, 76, -4, 0.8, "red", "Draft for review", "Customer follow-up", "Approve or ask for changes"),
    (62, 11, 4, 1.3, "img", "Company memory", "What your agents read", "memory-detail"),
    (36, 90, 5, 1.1, "img", "Finances", "Cash and runway", "finances-detail"),
    (88, 22, 6, 1.5, "", "Decision", "Keep pricing simple", "docs/decisions/"),
    (11, 78, 4, 1.2, "", "Session notes", "What changed this week", "notes/company/sessions/"),
    (30, 12, -4, 0.9, "", "Calendar", "Supplier call on Tuesday", "Prep notes ready"),
    (63, 90, -5, 1.4, "img", "Content", "Drafts to review", "content-detail"),
    (93, 50, 3, 0.7, "far", "Chat", "Can you send the invoice?", "From a connected chat"),
    (5, 51, -3, 0.9, "far", "Skill", "/digest", "A weekly summary"),
    (76, 33, 5, 1.0, "far", "Briefing", "What needs you today", "3 items"),
]
TICKER = [("claude", "Claude Code"), ("google-antigravity", "Google Antigravity"), ("kiro", "Kiro"), ("kimi", "Kimi"), (None, "Codex"), ("beeper", "Beeper"),
          ("google", "Google Workspace"), ("notion", "Notion"), ("github", "GitHub"), ("vercel", "Vercel"), ("figma", "Figma")]


def hero_scene(flow: str) -> str:
    def chip(x, y, r, k, cls, lab, t, line):
        if cls == "img":  # a real crop of the app; the last field names the file
            w, h = size(SCREENS / f"{line}.webp")
            body = f'<img src="/screens/{line}.webp" alt="" width="{w}" height="{h}" decoding="async"><b>{e(t)}</b>'
        else:
            body = f"<b>{e(t)}</b><i>{e(line)}</i>"
        return f'<li class="chip {cls}" style="--x:{x};--y:{y};--r:{r};--k:{k}"><div class="chip-in"><small>{e(lab)}</small>{body}</div></li>'
    chips = "".join(chip(*c) for c in CHIPS)
    m = re.search(r'<p class="eyebrow">(.*?)</p>\n?', flow)
    title = f'<span class="form-title">{m[1]}</span>' if m else ""
    flow = flow.replace(m[0], "", 1) if m else flow
    flow = flow.replace("<h1>", "<h1 data-split>", 1).replace("</h1>\n<p>", '</h1>\n<p class="lede">', 1)
    return f"""<section class="hero hero-home" id="overview"><div class="hero-pin">
<ul class="orbit" aria-hidden="true">{chips}</ul>
<div class="hero-copy"><div class="pad"><div class="pad-head"><div><b><i class="mk" aria-hidden="true"></i>Alacrán</b>{title}</div><span class="serial" aria-hidden="true">No. <em>00471</em></span></div>{flow}</div></div>
<div class="vault" aria-hidden="true"><div class="vault-card"><small>File copy · Example company</small>
<code><b>definitions/</b><span>company facts</span></code><code><b>notes/</b><span>working notes</span></code><code><b>docs/decisions/</b><span>the reasoning</span></code><code><b>records/</b><span>department data</span></code></div>
<p class="vault-line">One memory. Plain files you own.</p></div>
<p class="hero-note">Example company · Sample data</p>
</div></section>"""


def ticker() -> str:
    def item(k, n):
        mark = f'<svg class="bi" aria-hidden="true"><use href="#b-{k}"/></svg>' if k else ""
        return f"<span>{mark}{e(n)}</span>"
    row = "".join(item(k, n) for k, n in TICKER)
    return f'<div class="ticker" aria-hidden="true"><div class="ticker-row">{row}{row}</div></div>'


BENEFIT_VIS = [
    '<div class="cell-vis" aria-hidden="true"><div class="row need" style="--n:0"><i></i>Customer inquiry waiting</div><div class="row" style="--n:1"><i></i>3 follow-ups ready</div><div class="row" style="--n:2"><i></i>Finances refreshed</div><div class="row" style="--n:3"><i></i>2 drafts to review</div></div>',
    '<div class="cell-vis" aria-hidden="true"><div class="row" style="--n:0"><i></i><span class="type" style="--n:0;--w:24ch">definitions/company.yaml</span></div><div class="row" style="--n:1"><i></i><span class="type" style="--n:1;--w:22ch">docs/decisions/pricing.md</span></div><div class="row" style="--n:2"><i></i><span class="type" style="--n:2;--w:25ch">notes/company/sessions/</span></div></div>',
    '<div class="cell-vis days" aria-hidden="true">' + "".join(f'<u style="--n:{n};--h:{h}"></u>' for n, h in enumerate((.5, .8, .6, 1, .7, .4, .9))) + '<em>Runs every morning</em></div>',
    '<div class="cell-vis diff" aria-hidden="true"><p class="del">- Reply by Friday</p><p class="add">+ Reply by Thursday, menu attached</p><p class="add">+ Offer the team a tasting</p><div class="go-row"><em>Approve</em><em>Ask for changes</em></div><span class="stamp">Saved</span></div>',
]
DEPT_VIS = [
    '<div class="dept-vis" aria-hidden="true"><div class="dots">' + "".join(f'<b style="--n:{n}">{t}</b>' for n, t in enumerate(("Prospect", "Contacted", "Follow-up drafted", "Reviewed"))) + '</div></div>',
    '<div class="dept-vis" aria-hidden="true"><svg viewBox="0 0 200 120" preserveAspectRatio="none"><path class="fill" d="M0 100 L30 80 L60 90 L95 55 L130 62 L165 30 L200 22 L200 120 L0 120Z"/><path vector-effect="non-scaling-stroke" d="M0 100 L30 80 L60 90 L95 55 L130 62 L165 30 L200 22"/></svg></div>',
    '<div class="dept-vis" aria-hidden="true"><div class="dots">' + "".join(f'<b style="--n:{n}">{t}</b>' for n, t in enumerate(("Idea", "Draft", "In review", "Ready to publish"))) + '</div></div>',
    '<div class="dept-vis" aria-hidden="true"><span class="bub" style="top:10px;animation-delay:0s">Is the venue free Friday?</span><span class="bub me" style="top:46px;animation-delay:.9s">Draft reply ready</span><span class="bub" style="top:82px;animation-delay:1.8s">Thanks, confirmed</span></div>',
]
WORKSPACES = """<div class="spaces" aria-hidden="true"><svg class="string" viewBox="0 0 400 380" preserveAspectRatio="none"><path vector-effect="non-scaling-stroke" d="M34 78 C -12 130 -12 190 62 232"/><path vector-effect="non-scaling-stroke" d="M62 148 C 14 200 14 260 88 302"/></svg><div class="space on" style="--k:0"><small>Workspace</small><b>Example company</b></div><div class="space" style="--k:1"><small>Workspace</small><b>Second venture</b></div><div class="space" style="--k:2"><small>Workspace</small><b>Client project</b></div></div>"""
FOLDER = """<div class="folder" aria-hidden="true"><span class="stamp">Yours</span><small><span>File copy</span><span>Example company</span></small>
<code style="--n:0"><b>definitions/</b><span>company facts</span></code><code style="--n:1"><b>notes/</b><span>working notes</span></code><code style="--n:2"><b>docs/decisions/</b><span>the reasoning</span></code><code style="--n:3"><b>records/</b><span>department data</span></code><code style="--n:4"><b>AGENTS.md</b><span>working rules</span></code>
<div class="commit"><b>approved</b> follow-up draft, saved to history</div></div>"""


def agents_row() -> str:
    def mark(k):
        return f'<svg class="bi" aria-hidden="true"><use href="#b-{k}"/></svg>' if k else ""
    items = "".join(f"<li>{mark(k)}{n}</li>" for k, n in AGENT_MARKS)
    return f'<ul class="agents">{items}</ul>'.replace("<li>", '<li class="on">', 1)


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


def strip(n: int, label: str, right: str = "") -> str:
    return ""  # section-number eyebrows read as a template tell, so the rails and the spy list carry orientation instead


def with_strip(html_: str, s: str) -> str:
    return re.sub(r"^(<section[^>]*>)", lambda m: m[1] + s, html_, count=1)


def head_of(bl: list[dict]) -> tuple[str, list[dict]]:
    h2 = next(b for b in bl if b["t"] == "h2")
    return f'<h2 data-split>{inl(h2["s"])}</h2>', [b for b in bl if b is not h2]


def bento(bl: list[dict]) -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    cells = "".join(
        f'<article class="card" style="--i:{n}"><span class="num">{n + 1:02d}</span>{BENEFIT_VIS[n % 4]}<h3>{inl(t)}</h3>{render_flow(b)}</article>'
        for n, (t, b) in enumerate(groups))
    return f'<section class="sec" id="features">{strip(2, "What it does", "Briefing, context, routines, review")}<div class="sec-in"><div class="reveal">{title}{render_flow(intro)}</div><div class="cards cols-2 bento">{cells}</div></div></section>'


def depts(bl: list[dict]) -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    cols = "".join(
        f'<article class="dept"><span class="idx">{n + 1:02d}</span><h3>{inl(t)}</h3>{render_flow(b)}{DEPT_VIS[n % 4]}</article>'
        for n, (t, b) in enumerate(groups))
    return f'<section class="sec" id="departments">{strip(3, "Departments", "Customers, finances, content, messages")}<div class="sec-in"><div class="reveal">{title}{render_flow(intro)}</div><div class="depts">{cols}</div></div></section>'


def how(bl: list[dict]) -> str:
    title, rest = head_of(bl)
    intro, groups = groups_of(rest)
    tail = []
    last_t, last_b = groups[-1]
    if last_b and last_b[-1]["t"] == "p" and lone_link(last_b[-1]["s"]):
        tail, groups[-1] = [last_b[-1]], (last_t, last_b[:-1])
    steps = "".join(
        f'<article class="card" data-n="{m[1].zfill(2)}"><span class="num">{m[1].zfill(2)}</span><h3>{inl(m[2])}</h3>{render_flow(b)}</article>'
        for t, b in groups for m in [re.match(r"^(\d+)\. (.+)$", t)])
    return f'<section class="sec alt" id="how">{strip(4, "How it works", "Four steps")}<div class="sec-in"><div class="reveal">{title}</div><div class="cards how">{steps}</div>{render_flow(tail)}</div></section>'


def build_home(p: dict) -> str:
    _, groups = split(p["blocks"], "h4")
    out, faq_ld = [], []
    for g, bl in groups:
        name = g["s"]
        if name == "Hero":
            out += [hero_scene(render_flow(bl)), ticker()]
        elif name.startswith("Product tour"):
            out.append(with_strip(tour(g, bl), strip(1, "See it work", "Example company, sample data")).replace('<div class="tabs reveal"', '<span class="stamp" aria-hidden="true">Approved</span><div class="tabs reveal"', 1))
        elif name == "Benefits":
            out.append(bento(bl))
        elif name == "Departments":
            out.append(depts(bl))
        elif name == "How it works":
            out.append(how(bl))
        elif name == "Final call to action":
            out.append(section_html("cta", "", bl))
        else:
            if name.startswith("FAQ"):
                q = None
                for b in bl:
                    if is_q(b):
                        q = {"@type": "Question", "name": b["s"].strip("*"), "acceptedAnswer": {"@type": "Answer", "text": ""}}
                        faq_ld.append(q)
                    elif q and b["t"] == "p":
                        q["acceptedAnswer"]["text"] = (q["acceptedAnswer"]["text"] + " " + b["s"]).strip()
            if not any(b["t"] == "h2" for b in bl):
                bl = [{"t": "h2", "s": name}] + bl
            visual = {"Multiple companies": WORKSPACES, "Ownership": FOLDER,
                      "Flexible agents": '<div class="agents-vis"><div class="core"><small>Company memory</small><b>Same files, any agent</b></div>' + agents_row() + "</div>"}.get(name, "")
            sid, num, right = {"Multiple companies": ("companies", 5, "One workspace each"), "Ownership": ("ownership", 6, "Plain files, yours"),
                               "Flexible agents": ("agents", 7, "Bring your own AI")}.get(name, (g["id"] or "", 8, ""))
            out.append(with_strip(section_html("alt" if name == "Flexible agents" else ("stacked" if name == "Multiple companies" else ""), sid, bl, visual), strip(num, name.replace("FAQ", "Questions"), right)))
    ld = [{"@type": "SoftwareApplication", "name": "Alacrán", "url": f"{SITE}/", "description": p["desc"],
           "applicationCategory": "BusinessApplication", "operatingSystem": "macOS, Debian, Ubuntu",
           "downloadUrl": "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest",
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "publisher": {"@id": f"{SITE}/#org"}},
          {"@type": "FAQPage", "mainEntity": faq_ld}]
    return page(p, "\n".join(out), ld, "home")



# ---------------------------------------------------------------- pages

def hv(cap: str, inner: str, cls: str = "") -> str:
    return f'<div class="hero-vis {cls}" aria-hidden="true"><small class="cap">{e(cap)}</small>{inner}</div>'


def checks(items: list[str]) -> str:
    return '<ol class="check">' + "".join(f'<li style="--n:{n}">{e(x)}</li>' for n, x in enumerate(items)) + "</ol>"


SUB_VIS = {
    "/departments/customers": hv("Example company · Pipeline", '<div class="board"><div class="col"><b>Prospect</b><div class="mc" style="--n:0">Northstar Café</div><div class="mc" style="--n:1">Harbor Print</div></div><div class="col"><b>Contacted</b><div class="mc" style="--n:2">Lumen Studio</div></div><div class="col"><b>Follow-up</b><div class="mc" style="--n:3">Bright Dental</div></div><div class="col"><b>Reviewed</b></div><div class="mc mover">Draft for Northstar</div></div>'),
    "/departments/messages": hv("Example company · Messages", '<div class="thread"><p class="msg" style="--n:0">Is the venue free on Friday?</p><p class="msg me" style="--n:1">Draft reply ready for review</p><p class="msg" style="--n:2">Can you send the menu?</p><div class="msg draft" style="--n:3"><small>Draft for review</small>Yes, Friday is open. Menu attached.<span class="pane-btns"><em>Approve</em><em>Ask for changes</em></span></div></div>'),
    "/templates": hv("Seven starter packs", '<div class="fan">' + "".join(f'<div class="pk" style="--i:{i};z-index:{i if i < 4 else 7 - i}"><small>Starter pack</small><b>{n}</b></div>' for i, n in enumerate(("General", "Software engineering", "Sales", "Marketing", "Customer support", "HR &amp; People", "Leadership"))) + "</div>"),
    "/integrations": hv("Your AI and your tools", '<div class="hub"><div class="core"><small>Company memory</small><b>Your files</b></div><div class="spin">' + "".join(f'<div class="sat" style="--a:{a}"><i><span>{n}</span></i></div>' for a, n in zip(range(0, 360, 60), ("Claude Code", "Google", "GitHub", "Notion", "Beeper", "Vercel"))) + "</div></div>"),
    "/use-cases": hv("From a question to a result", '<div class="flow3"><div class="s3" style="--n:0"><small>1 / Ask</small><b>Draft a follow-up for this prospect.</b></div><div class="s3" style="--n:1"><small>2 / Draft</small><b>A follow-up, based on your saved records.</b></div><div class="s3" style="--n:2"><small>3 / Review</small><b>Approve, ask for changes, or discard.</b></div></div>'),
    "/docs": FOLDER,
    "/getting-started": hv("Seven steps", checks(["Install and open Alacrán", "Choose your starting goal", "Connect your AI", "Create your company", "Describe how your business works", "Review your first draft", "Ask a useful first question"])),
    "/how-to-use": hv("A day with Alacrán", checks(["Start with the morning briefing", "Choose a department and a task", "Review proposed work", "Keep what is useful", "Turn good tasks into routines"])),
}


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
  <meta name="theme-color" content="#22362c">
  <link rel="canonical" href="{url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Alacrán">
  <meta property="og:url" content="{url}">
  <meta property="og:title" content="{e(p["title"])}">
  <meta property="og:description" content="{e(p["desc"])}">
  <meta property="og:image" content="{SITE}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Alacrán: Your business, organized. Your AI, put to work.">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(p["title"])}">
  <meta name="twitter:description" content="{e(p["desc"])}">
  <meta name="twitter:image" content="{SITE}/og.png">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon.png" sizes="128x133">
  <link rel="preload" href="/fonts/bigshoulders.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/franklin.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/v5.css">
  <script src="/v4.js" defer></script>
  <script src="/brands.js" defer></script>
</head>"""


def split(bl: list[dict], level: str):
    idx = [i for i, b in enumerate(bl) if b["t"] == level]
    pre = bl[:idx[0]] if idx else bl
    return pre, [(bl[i], bl[i + 1:(idx[k + 1] if k + 1 < len(idx) else len(bl))]) for k, i in enumerate(idx)]


def section_html(cls: str, sid: str, bl: list[dict], visual: str = "", extra: str = "") -> str:
    h2 = next((b for b in bl if b["t"] == "h2"), None)
    rest = [b for b in bl if b is not h2]
    hid = f' id="{sid}"' if sid else ""
    title = f"<h2 data-split>{inl(h2['s'])}</h2>" if h2 else ""
    if visual:
        return (f'<section class="sec split {cls}"{hid}><div class="split-copy reveal">{title}{section_body(rest)}</div>'
                f'<div class="split-vis reveal">{visual}</div></section>')
    return f'<section class="sec {cls}"{hid}><div class="sec-in"><div class="reveal">{title}</div><div class="reveal">{section_body(rest)}{extra}</div></div></section>'


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
                steps.append((label, shot, cap, disc if SHOTS[shot][1] == SAMPLE else SHOTS[shot][1]))
    tabs, panels = [], []
    for n, (label, shot, cap, note) in enumerate(steps):
        first = n == 0
        tabs.append(f'<button type="button" role="tab" id="tt-{n}" aria-controls="tp-{n}" aria-selected="{str(first).lower()}"'
                    f'{"" if first else NOTAB}>{inl(label)}</button>')
        panels.append(f'<div role="tabpanel" id="tp-{n}" aria-labelledby="tt-{n}" class="tour-panel"{"" if first else " hidden"}>'
                      f'<div class="tour-media">{shot_img(shot, lazy=not first)}</div>'
                      f'<div class="tour-cap"><p>{inl(cap)}</p><p class="shot-foot"><span class="disclosure">{e(note)}</span>{zoom(shot)}</p></div></div>')
    return f"""<section class="sec tour" id="{g['id']}"><div class="sec-in">
  <div class="reveal"><h2>{inl(h2['s'])}</h2><p class="lede">{inl(intro)}</p></div>
  <div class="tabs reveal" role="tablist" aria-label="Product tour">{''.join(tabs)}</div>
  <figure class="shot shot-tour" data-scroll3d><div class="shot-frame"><div class="bar"><i></i><i></i><i></i><span>Alacrán</span></div>{''.join(panels)}</div></figure>
</div></section>"""


def build_sub(p: dict, cta: list[dict]) -> str:
    pre, secs = split(p["blocks"], "h2")
    legal = p["route"] in ("/privacy", "/terms")
    if legal and pre and pre[1:] and pre[0]["t"] == "p" and " / " in pre[0]["s"]:
        pre = [{"t": "p", "s": f"Eyebrow: **{pre[0]['s']}**"}] + pre[1:]
    if p["route"] in HERO_SHOTS:
        vis = shot3d(HERO_SHOTS[p["route"]], cls="shot-hero")
    elif p["route"] in SUB_VIS:
        vis = SUB_VIS[p["route"]]
    elif legal:
        vis = ""
    else:
        has_prompt = any(b["t"] == "quote" or b["t"] == "p" and "Try asking" in b["s"] for b in p["blocks"])
        vis = stack([h["s"] for h, _ in secs], "Your next result" if has_prompt else None)
    out = [f'<section class="hero{" hero-legal" if legal else ""}"><div class="hero-copy">{render_flow(pre)}</div>{vis}</section>']
    out += [section_html("alt" if n % 2 else "", h["id"] or "", [h] + bl,
                         extra=shot3d(SECTION_SHOTS[(p["route"], h["s"])]) if (p["route"], h["s"]) in SECTION_SHOTS else "")
            for n, (h, bl) in enumerate(secs)]
    missing = {k for k in SECTION_SHOTS if k[0] == p["route"]} - {(p["route"], h["s"]) for h, _ in secs}
    if missing:
        raise SystemExit(f"SECTION_SHOTS names a heading the copy no longer has: {sorted(missing)}")
    if not legal:
        out.append(section_html("cta", "", cta))
    return page(p, "\n".join(out), [], "legal" if legal else "sub")


DIALOG = """<dialog class="viewer" aria-label="Full screenshot">
  <form method="dialog" class="viewer-bar"><button class="btn btn-ghost viewer-close" value="close">Close</button></form>
  <img alt="">
</dialog>"""


SPY = [("overview", "Overview"), ("tour", "See it work"), ("features", "What it does"), ("departments", "Departments"), ("how", "How it works"),
       ("companies", "Companies"), ("ownership", "Ownership"), ("agents", "Agents"), ("faq", "Questions")]


def furniture(kind: str) -> str:
    """An SVG filter that roughens the rubber stamps; nothing else sits on the page."""
    return ('<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="rough">'
            '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" result="n"/>'
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter></svg>')


MAC_CMD = 'xattr -cr "/Applications/Alacran.app"'
MAC_DIALOG = f"""<dialog class="mac-help" aria-labelledby="mac-title">
  <form method="dialog" class="viewer-bar"><button class="btn btn-ghost viewer-close" value="close">Close</button></form>
  <div class="mac-body">
    <h2 id="mac-title">Your download has started. One more step on a Mac.</h2>
    <p class="lede">Apple has not notarized Alacrán, because that needs a paid Apple Developer account. Until you do this once, macOS may block the app, often with the message "Alacrán is damaged and can't be opened". It is not damaged.</p>
    <ol class="mac-steps">
      <li><b>Install.</b> Open the downloaded <code>.dmg</code> and drag Alacrán into Applications.</li>
      <li><b>Run this in Terminal, once.</b> It clears the quarantine flag macOS puts on downloaded files.
        <div class="cmd"><code id="mac-cmd">{MAC_CMD}</code><button type="button" class="btn btn-primary" data-copy="#mac-cmd">Copy command</button></div>
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
{furniture(kind)}
<main id="main">
{main}
</main>
{FOOTER}
{DIALOG if 'class="zoom"' in main else ''}
{MAC_DIALOG}
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
