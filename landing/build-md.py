#!/usr/bin/env python3
"""Write a Markdown twin of every page, plus /llms.txt and /llms-full.txt.

Agents read a page far better as Markdown than as styled HTML, and a hand-kept
second copy of the prose would drift. So the twins are derived from each page's
<main>: /docs -> /docs.md, /departments/finances -> /departments/finances.md.
Re-run after editing any page; the output is deterministic, so a re-run with no
edits changes nothing.
"""
import html as htmllib
import pathlib
import re
from html.parser import HTMLParser

SITE = "https://www.alacran.app"
SUMMARY = ("Alacrán is the agentic business environment: a local-first desktop app that brings company "
           "knowledge, departments, and AI agents into one workspace, so you can run business workflows, "
           "review the results, and keep control of your records. Free for macOS and Linux.")
# Order and grouping of /llms.txt. A page missing from here is listed under "Other".
SECTIONS = [
    ("Start here", ["getting-started", "how-to-use", "docs"]),
    ("Reference", ["templates", "integrations", "use-cases"]),
    ("Departments", ["departments/customers", "departments/finances", "departments/content", "departments/messages"]),
    ("Legal", ["privacy", "terms"]),
]

BLOCK = {"h1": "# ", "h2": "## ", "h3": "### ", "p": "", "small": "", "div": "", "article": "",
         "section": "", "pre": "", "li": "- ", "footer": "", "header": ""}
SKIP_CLASS = ("v2-guide-nav", "side", "toc")


class Main(HTMLParser):
    """Turns the inside of <main> into Markdown; everything else is ignored."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.skip = None  # [tag, depth] while inside something to drop
        self.prefix = ""
        self.buf = []
        self.out = []
        self.href = None

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text:
            self.out.append(self.prefix + text)
        self.prefix = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "main":
            self.in_main = True
            return
        if not self.in_main:
            return
        if self.skip:
            if tag == self.skip[0]:
                self.skip[1] += 1
            return
        classes = (a.get("class") or "").split()
        if (tag in ("svg", "script", "style", "button") or a.get("aria-hidden") == "true"
                or any(c in SKIP_CLASS for c in classes)):
            self.skip = [tag, 1]
            return
        if tag in BLOCK:
            self.flush()
            self.prefix = BLOCK[tag]
        elif tag in ("b", "strong"):
            self.buf.append("**")
        elif tag == "code":
            self.buf.append("`")
        elif tag == "a" and a.get("href"):
            h = a["href"]
            self.href = SITE + h if h.startswith("/") else h
            self.buf.append("[")

    def handle_endtag(self, tag):
        if tag == "main":
            self.flush()
            self.in_main = False
            return
        if not self.in_main:
            return
        if self.skip:
            if tag == self.skip[0]:
                self.skip[1] -= 1
                if not self.skip[1]:
                    self.skip = None
            return
        if tag in BLOCK:
            self.flush()
        elif tag in ("b", "strong"):
            self.buf.append("**")
        elif tag == "code":
            self.buf.append("`")
        elif tag == "a" and self.href:
            self.buf.append(f"]({self.href})")
            self.href = None

    def handle_data(self, data):
        if self.in_main and not self.skip:
            self.buf.append(data)


def meta(html, pattern):
    m = re.search(pattern, html)
    return htmllib.unescape(m.group(1)) if m else ""


root = pathlib.Path(__file__).parent
pages = []  # (slug, title, description, body)
for path in sorted(root.glob("*/index.html")) + sorted(root.glob("departments/*/index.html")):
    slug = path.parent.relative_to(root).as_posix()
    html = path.read_text()
    p = Main()
    p.feed(html)
    body = "\n\n".join(p.out)
    body = re.sub(r"\*\* ?\*\*", "", body)  # a bold run left empty by a stripped icon
    body = re.sub(r"\[([^\]]*?) +\]", r"[\1]", body)  # a stripped icon leaves a space inside the link
    body = body.replace(")[", ") [")  # links that sat side by side in a row
    title = meta(html, r"<title>([^<]*)</title>")
    desc = meta(html, r'<meta name="description" content="([^"]*)"')
    md = f"{body}\n\nSource: {SITE}/{slug}\n"
    (root / f"{slug}.md").write_text(md)
    pages.append((slug, title, desc, md))
    print("wrote", f"{slug}.md")

by_slug = {s: (t, d, md) for s, t, d, md in pages}
lines = ["# Alacrán", "", f"> {SUMMARY}", "",
         "Every page below has a Markdown version at the same address with `.md` added. "
         f"All of it in one file: {SITE}/llms-full.txt", ""]
order = []
for heading, slugs in SECTIONS + [("Other", [s for s, *_ in pages])]:
    items = [s for s in slugs if s in by_slug and s not in order]
    if not items:
        continue
    lines += [f"## {heading}", ""]
    lines += [f"- [{by_slug[s][0]}]({SITE}/{s}.md): {by_slug[s][1]}" for s in items]
    lines.append("")
    order += items
(root / "llms.txt").write_text("\n".join(lines))

full = [f"# Alacrán\n\n> {SUMMARY}\n"] + [f"---\n\n{by_slug[s][2]}" for s in order]
(root / "llms-full.txt").write_text("\n".join(full))
print("wrote llms.txt, llms-full.txt")
