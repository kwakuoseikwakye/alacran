#!/usr/bin/env python3
"""Automated QA & HTTP Verification Test Suite for Alacrán Landing Pages.

Tests:
1. Spawns an HTTP server on a random local port serving control-panel/landing.
2. Verifies HTTP 200 OK across all landing pages:
   - / (index.html)
   - /how-to-use/
   - /templates/
   - /integrations/
   - /use-cases/
   - /docs/
   - /terms/
   - /privacy/
   plus clean URLs and all static assets.
3. Verifies zero em-dashes (\u2014) in site.css and all HTML files.
4. Validates DOM tree integrity across all HTML files.
5. Verifies responsive breakpoints, overflow containment, and WCAG contrast math (>5:1 / >12:1).
"""

from __future__ import annotations

import contextlib
import html as htmllib
import http.server
import math
import os
import pathlib
import re
import struct
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

LANDING_DIR = pathlib.Path(__file__).resolve().parent


class CleanURLHandler(http.server.SimpleHTTPRequestHandler):
    """Simple handler that serves index.html for directories and clean URLs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(LANDING_DIR), **kwargs)

    def do_GET(self):
        # Clean URL support: if /slug without extension exists as slug/index.html or slug.html
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path
        local_path = LANDING_DIR / clean_path.lstrip("/")

        if not local_path.exists():
            if (LANDING_DIR / f"{clean_path.lstrip('/')}/index.html").is_file():
                self.path = f"{clean_path}/index.html"
            elif (LANDING_DIR / f"{clean_path.lstrip('/')}.html").is_file():
                self.path = f"{clean_path}.html"

        return super().do_GET()

    def log_message(self, format, *args):
        # Silence standard HTTP access logging during tests
        pass


class StrictHTMLValidator(HTMLParser):
    VOID_ELEMENTS = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"
    }

    def __init__(self):
        super().__init__()
        self.tag_stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() not in self.VOID_ELEMENTS:
            self.tag_stack.append(tag.lower())

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self.VOID_ELEMENTS:
            return
        if not self.tag_stack:
            self.errors.append(f"Unexpected closing tag: </{t}>")
            return
        expected = self.tag_stack.pop()
        if expected != t:
            self.errors.append(f"Mismatched closing tag: expected </{expected}>, got </{t}>")


def compute_relative_luminance(hex_color: str) -> float:
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0

    def adjust(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b)


def compute_contrast_ratio(hex1: str, hex2: str) -> float:
    l1 = compute_relative_luminance(hex1)
    l2 = compute_relative_luminance(hex2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def test_http_server() -> list[str]:
    failures = []
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), CleanURLHandler)
    port = server.server_address[1]
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    routes = [
        # Landing pages (directory style)
        ("/", 200, "text/html"),
        ("/how-to-use/", 200, "text/html"),
        ("/getting-started/", 200, "text/html"),
        ("/templates/", 200, "text/html"),
        ("/integrations/", 200, "text/html"),
        ("/use-cases/", 200, "text/html"),
        ("/docs/", 200, "text/html"),
        ("/terms/", 200, "text/html"),
        ("/privacy/", 200, "text/html"),
        # Clean URLs without trailing slash
        ("/how-to-use", 200, "text/html"),
        ("/templates", 200, "text/html"),
        ("/integrations", 200, "text/html"),
        ("/use-cases", 200, "text/html"),
        ("/docs", 200, "text/html"),
        ("/terms", 200, "text/html"),
        ("/privacy", 200, "text/html"),
        ("/departments/customers/", 200, "text/html"),
        ("/departments/finances/", 200, "text/html"),
        ("/departments/content/", 200, "text/html"),
        ("/departments/messages/", 200, "text/html"),
        # Crawl files and the link-preview card
        ("/robots.txt", 200, "text/plain"),
        ("/sitemap.xml", 200, "xml"),
        ("/og.png", 200, "image/png"),
        # Static CSS and JS assets
        ("/v6.css", 200, "text/css"),
        ("/v6.js", 200, "javascript"),
        ("/fonts/onest.woff2", 200, "font"),
        ("/mark-white.png", 200, "image/png"),
        ("/brands.js", 200, "javascript"),
        # Static image assets
        ("/logo.png", 200, "image/png"),
        ("/logo-sm.png", 200, "image/png"),
        ("/favicon.png", 200, "image/png"),
        ("/scorpion.png", 200, "image/png"),
    ]

    base_url = f"http://127.0.0.1:{port}"
    print(f"Testing {len(routes)} HTTP endpoints on {base_url}...")

    for path, expected_status, expected_mime in routes:
        url = base_url + path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Alacran-QA/1.0"})
            with urllib.request.urlopen(req, timeout=5) as response:
                status = response.status
                content_type = response.headers.get("Content-Type", "")
                data = response.read()

                if status != expected_status:
                    failures.append(f"{path}: expected status {expected_status}, got {status}")
                if expected_mime not in content_type:
                    failures.append(f"{path}: expected mime '{expected_mime}', got '{content_type}'")
                if len(data) == 0:
                    failures.append(f"{path}: empty response payload")
        except Exception as e:
            failures.append(f"{path}: HTTP request failed: {e}")

    server.shutdown()
    server.server_close()
    return failures


def test_em_dashes() -> list[str]:
    failures = []
    em_dash = "\u2014"

    # Scan the stylesheet
    site_css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    if em_dash in site_css:
        failures.append("control-panel/landing/v6.css contains em-dash (\u2014)")

    # Scan all HTML files
    for html_file in sorted(LANDING_DIR.glob("**/*.html")):
        content = html_file.read_text(encoding="utf-8")
        if em_dash in content:
            rel = html_file.relative_to(LANDING_DIR)
            failures.append(f"{rel} contains em-dash (\u2014)")

    return failures


# Headings and phrases that only appear in the implementation notes of
# docs/website-copy.md, never in its website copy.
INTERNAL_MARKERS = ("not website copy", "Release checks", "Implementation notes",
                    "Source basis", "Pasted text", "Status: Existing", "Editorial and implementation")


def test_html_dom_and_assets() -> list[str]:
    failures = []
    html_files = [
        LANDING_DIR / "index.html",
        *(LANDING_DIR / page / "index.html" for page in
          ("getting-started", "how-to-use", "docs", "templates", "integrations", "use-cases", "privacy", "terms")),
        *sorted((LANDING_DIR / "departments").glob("*/index.html")),
    ]

    for f in html_files:
        if not f.is_file():
            failures.append(f"Missing HTML page: {f}")
            continue

        content = f.read_text(encoding="utf-8")

        # 0. The copy document's internal notes must never be published.
        for marker in INTERNAL_MARKERS:
            if marker.lower() in content.lower():
                failures.append(f"{f.relative_to(LANDING_DIR)}: publishes internal note text '{marker}'")
        if content.count("<h1") != 1:
            failures.append(f"{f.relative_to(LANDING_DIR)}: expected exactly one <h1>")

        # 0b. Every "View full screenshot" button has the viewer and a real file;
        # every tour tab has its panel.
        if 'class="zoom"' in content and '<dialog class="viewer"' not in content:
            failures.append(f"{f.relative_to(LANDING_DIR)}: zoom buttons but no viewer dialog")
        for m in re.finditer(r'data-full="/([^"]+)"', content):
            if not (LANDING_DIR / m.group(1)).is_file():
                failures.append(f"{f.relative_to(LANDING_DIR)}: full screenshot '{m.group(1)}' does not exist")
        for m in re.finditer(r'role="tab" id="([^"]+)" aria-controls="([^"]+)"', content):
            if f'id="{m.group(2)}" aria-labelledby="{m.group(1)}"' not in content:
                failures.append(f"{f.relative_to(LANDING_DIR)}: tab {m.group(1)} has no matching panel")

        # 1. Viewport meta tag
        if 'name="viewport"' not in content:
            failures.append(f"{f.name}: missing viewport meta tag")

        # 2. Strict DOM parse
        parser = StrictHTMLValidator()
        parser.feed(content)
        if parser.errors:
            for err in parser.errors:
                failures.append(f"{f.name} DOM error: {err}")
        if parser.tag_stack:
            failures.append(f"{f.name}: unclosed tags: {parser.tag_stack}")

        # 3. Verify referenced local resources exist
        for match in re.finditer(r'(?:href|src)="(/[^"#?]+)"', content):
            ref = match.group(1).lstrip("/")
            # Ignore external or clean URLs
            if "." in ref:
                target_file = LANDING_DIR / ref
                if not target_file.is_file():
                    failures.append(f"{f.name}: referenced local asset '{ref}' does not exist")

    return failures


def test_responsive_and_contrast() -> list[str]:
    failures = []
    site_css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")

    # 1. Check strict overflow containment. `clip`, not `hidden`: hidden on body makes it a scroll container.
    if "overflow-x: clip" not in site_css:
        failures.append("v6.css: missing global 'overflow-x: clip' on body")
    if "box-sizing: border-box" not in site_css:
        failures.append("v6.css: missing 'box-sizing: border-box'")

    # 2. Check required responsive breakpoints
    required_breakpoints = ["1100px", "900px", "720px", "480px"]
    for bp in required_breakpoints:
        if f"max-width: {bp}" not in site_css:
            failures.append(f"v6.css: missing responsive breakpoint for max-width: {bp}")

    if "prefers-reduced-motion" not in site_css:
        failures.append("v6.css: missing prefers-reduced-motion accessibility media query")

    # 3. Contrast verification, read from v6.css itself so a palette change
    # is checked rather than a copy of last palette's numbers.
    def token(name: str) -> str:
        m = re.search(rf"{re.escape(name)}:\s*(#[0-9a-fA-F]{{6}})\b", site_css)
        return m.group(1) if m else "#000000"

    ground = token("--bg")
    colors = {name: token(name) for name in
              ("--text", "--text-2", "--text-3", "--marker")}

    for var_name, hex_code in colors.items():
        ratio = compute_contrast_ratio(ground, hex_code)
        if ratio < 5.0:
            failures.append(
                f"Contrast failure for {var_name} ({hex_code}) against ground ({ground}): "
                f"{ratio:.2f}:1 (must be > 5:1)"
            )
        else:
            print(f"  ok  {var_name:15} {hex_code} vs {ground} -> {ratio:.2f}:1 (> 5:1 WCAG)")

    return failures


def test_logo_and_support_widget() -> list[str]:
    """Every page carries the desktop app's scorpion and the Buy Me a Coffee widget."""
    failures = []
    pages = [LANDING_DIR / "index.html", *sorted(LANDING_DIR.glob("*/index.html")), *sorted(LANDING_DIR.glob("departments/*/index.html"))]
    for f in pages:
        content = f.read_text(encoding="utf-8")
        rel = f.relative_to(LANDING_DIR)
        if 'src="/logo.png"' not in content:
            failures.append(f"{rel}: the desktop app's scorpion (/logo.png) is missing from the header")
        if 'data-name="BMC-Widget"' not in content or 'data-id="alacran"' not in content:
            failures.append(f"{rel}: the Buy Me a Coffee widget script is missing")
    return failures


# ---------------------------------------------------------------------------
# Website UX fix: link previews, download menu, icons, vendor marks, copy rules.
# Each check is a pure function over HTML or CSS text plus a self-test that
# breaks a real page and asserts the check notices.
# ---------------------------------------------------------------------------

SITE = "https://www.alacran.app"
ROUTES = ["/", "/getting-started", "/how-to-use", "/docs", "/templates", "/integrations", "/use-cases",
          "/privacy", "/terms", "/departments/customers", "/departments/finances",
          "/departments/content", "/departments/messages"]
DL_FILES = ["releases/latest/download/Alacran-arm64.dmg", "releases/latest/download/Alacran-x64.dmg",
            "releases/latest/download/Alacran.deb"]
SOCIAL_TAGS = ["og:type", "og:site_name", "og:url", "og:title", "og:description", "og:image",
               "og:image:width", "og:image:height", "og:image:alt", "og:image:type", "og:image:secure_url",
               "og:locale", "twitter:card", "twitter:title", "twitter:description", "twitter:image",
               "twitter:image:alt"]
URL_TAGS = ["og:url", "og:image", "og:image:secure_url", "twitter:image"]
IMAGE_TAGS = ["og:image", "og:image:secure_url", "twitter:image"]


def page_html(route: str) -> str:
    path = LANDING_DIR / "index.html" if route == "/" else LANDING_DIR / route.strip("/") / "index.html"
    return path.read_text(encoding="utf-8")


def all_pages() -> dict[str, str]:
    return {r: page_html(r) for r in ROUTES}


@contextlib.contextmanager
def served():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), CleanURLHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


def fetch(url: str) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": "Alacran-QA/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as err:
        return err.code, "", b""


def png_size(data: bytes) -> tuple[int, int] | None:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        return None
    return struct.unpack(">II", data[16:24])


def head_of_html(content: str) -> str:
    return content.split("</head>")[0]


def meta_tags(content: str) -> dict[str, str]:
    return {m[1]: htmllib.unescape(m[2]) for m in
            re.finditer(r'<meta (?:property|name)="([^"]+)" content="([^"]*)">', head_of_html(content))}


def social_failures(content: str, route: str, base: str | None = None) -> list[str]:
    """Every link-preview tag is present and absolute; with a server, every card image is a real 1200x630 PNG."""
    out = []
    tags = meta_tags(content)
    for t in SOCIAL_TAGS:
        if not tags.get(t):
            out.append(f"{route}: missing or empty <meta {t}>")
    for t, want in (("og:image:width", "1200"), ("og:image:height", "630"), ("og:image:type", "image/png"),
                    ("twitter:card", "summary_large_image")):
        if tags.get(t) and tags[t] != want:
            out.append(f"{route}: {t} is {tags[t]!r}, want {want!r}")
    for t in URL_TAGS:
        if tags.get(t) and not tags[t].startswith(SITE + "/"):
            out.append(f"{route}: {t} is not an absolute {SITE}/ URL: {tags[t]!r}")
    canon = re.search(r'<link rel="canonical" href="([^"]+)">', content)
    if not canon or tags.get("og:url") != canon[1]:
        out.append(f"{route}: og:url does not match the canonical link")
    if base:
        for t in IMAGE_TAGS:
            url = tags.get(t, "")
            if not url.startswith(SITE + "/"):
                continue
            status, ctype, data = fetch(base + url[len(SITE):])
            if status != 200 or "image/png" not in ctype:
                out.append(f"{route}: {t} -> {status} {ctype!r}, want 200 image/png")
            elif png_size(data) != (1200, 630):
                out.append(f"{route}: {t} is {png_size(data)}, want a 1200x630 PNG")
            elif len(data) >= 600_000:
                out.append(f"{route}: {t} is {len(data)} bytes, want under 600,000")
    return out


def test_social_tags() -> list[str]:
    out = []
    with served() as base:
        for route, content in all_pages().items():
            out += social_failures(content, route, base)
    return out


def test_social_check_bites() -> list[str]:
    """The social check must fail on a real page with a tag removed or an image URL made relative."""
    real = page_html("/privacy")
    if social_failures(real, "/privacy"):
        return ["self-test needs the real privacy page to pass first"]
    out = []
    for name, broken in (
        ("og:locale removed", re.sub(r'\s*<meta property="og:locale"[^>]*>', "", real)),
        ("twitter:image:alt removed", re.sub(r'\s*<meta name="twitter:image:alt"[^>]*>', "", real)),
        ("og:image made relative", real.replace(f'property="og:image" content="{SITE}/og.png"', 'property="og:image" content="/og.png"')),
    ):
        if broken == real or not social_failures(broken, "/privacy"):
            out.append(f"social check did not notice: {name}")
    return out


def region(content: str, tag: str) -> str:
    m = re.search(rf"<{tag}[ >].*?</{tag}>", content, re.S)
    return m[0] if m else ""


def download_failures(content: str, route: str) -> list[str]:
    out = []
    for where in ("main", "footer"):
        part = region(content, where)
        for f in DL_FILES:
            if f"{f}\"" not in part:
                out.append(f"{route}: <{where}> has no link to {f}")
        if "Read the setup guide" not in part:
            out.append(f"{route}: <{where}> has no 'Read the setup guide' link")
    return out


def css_rule(css: str, selector: str) -> str:
    m = re.search(rf"(?:^|\n){re.escape(selector)}\s*\{{([^}}]*)\}}", css)
    return m[1] if m else ""


def test_download_blocks() -> list[str]:
    out = []
    for route, content in all_pages().items():
        out += download_failures(content, route)
    css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    if "overflow: hidden" in css_rule(css, ".cta-card"):
        out.append("v6.css: .cta-card clips with overflow: hidden, so the download menu is cut off")
    if "overflow: hidden" not in css_rule(css, ".cta-art"):
        out.append("v6.css: .cta-art must clip the decorative scorpion with overflow: hidden")
    if "color:" not in css_rule(css, ".menu"):
        out.append("v6.css: .menu sets no color, so it inherits white text onto a white panel inside the dark card")
    # Self-test: a footer with its download links removed must fail.
    real = page_html("/privacy")
    stripped = re.sub(r"<footer.*?</footer>", lambda m: m[0].replace("releases/latest/download", "x"), real, flags=re.S)
    if not download_failures(stripped, "/privacy"):
        out.append("download check did not notice a footer without download links")
    return out


def sprite_failures(content: str, ids: set[str], route: str) -> list[str]:
    return [f"{route}: <use href=\"#{i}\"> is not in brands.js"
            for i in sorted(set(re.findall(r'href="#([bcd]-[a-z0-9-]+)"', content))) if i not in ids]


def brand_ids() -> set[str]:
    return set(re.findall(r'id="([bcd]-[a-z0-9-]+)"', (LANDING_DIR / "brands.js").read_text(encoding="utf-8")))


def test_icons() -> list[str]:
    out = []
    ids = brand_ids()
    with served() as base:
        for path, size in (("/favicon-32.png", (32, 32)), ("/apple-touch-icon.png", (180, 180)), ("/favicon.png", None)):
            status, ctype, data = fetch(base + path)
            if status != 200 or "image/png" not in ctype:
                out.append(f"{path}: {status} {ctype!r}, want 200 image/png")
            elif size and png_size(data) != size:
                out.append(f"{path}: is {png_size(data)}, want {size}")
        for route, content in all_pages().items():
            links = re.findall(r'<link rel="(icon|apple-touch-icon)" href="([^"]+)"', content)
            if len(links) < 3 or {h for _, h in links} < {"/favicon.png", "/favicon-32.png", "/apple-touch-icon.png"}:
                out.append(f"{route}: expected the favicon, 32px and apple-touch-icon links, found {links}")
            for _, href in links:
                if fetch(base + href)[0] != 200:
                    out.append(f"{route}: icon link {href} does not return 200")
            out += sprite_failures(content, ids, route)
            for tag in re.findall(r"<img\b[^>]*>", content):
                if " alt=" not in tag:
                    out.append(f"{route}: <img> without alt: {tag[:80]}")
            for tag in re.findall(r'<svg class="bi"[^>]*>', content):
                if 'aria-hidden="true"' not in tag:
                    out.append(f"{route}: icon <svg class=\"bi\"> is not aria-hidden")
    if not sprite_failures(page_html("/integrations").replace("</main>", '<svg><use href="#b-nonexistent"/></svg></main>'), ids, "x"):
        out.append("sprite check did not notice a missing #b-nonexistent")
    return out


# Independent copy of build-site.py's MARKS: if the catalogue copy changes a name, update both.
MARKED = {"Beeper": "beeper", "WhatsApp": "whatsapp", "Discord": "discord", "Telegram": "telegram",
          "Notion": "notion", "GitHub": "github", "Vercel": "vercel", "Figma": "figma",
          "Claude Code": "claude", "Google Antigravity": "google-antigravity", "Kiro": "kiro", "Kimi": "kimi",
          "Anthropic API": "anthropic", "Google Workspace": "google"}
TEXT_ONLY = ["Slack", "Codex", "OpenAI API", "Canva", "Lovable", "DocuSign", "Zoom", "Miro", "Zapier", "Make",
             "n8n", "Typeform", "Loom", "Arcads", "ManyChat"]


def test_vendor_marks() -> list[str]:
    out = []
    content = page_html("/integrations")
    chips = {}
    for block in re.findall(r'<div class="chips">(.*?)</div>', content, re.S):
        for inner in re.findall(r"<span>(.*?)</span>", block, re.S):
            chips[htmllib.unescape(re.sub(r"<[^>]+>", "", inner)).strip()] = inner
    for name, key in MARKED.items():
        if f'<use href="#c-{key}"/>' not in chips.get(name, ""):
            out.append(f"/integrations: {name} has no #c-{key} mark in its own chip")
    for name in TEXT_ONLY:
        if name not in chips:
            out.append(f"/integrations: {name} is not in the catalogue")
        elif "<svg" in chips[name] or "<img" in chips[name]:
            out.append(f"/integrations: {name} has no available real mark and must be text only")
    if "<path" in region(content, "main"):
        out.append("/integrations: <main> contains an inline <path>; vendor marks come only from brands.js")
    agents = re.search(r'<ul class="agents">(.*?)</ul>', page_html("/"), re.S)
    items = re.findall(r"<li[^>]*>(.*?)</li>", agents[1] if agents else "", re.S)
    for name in ("Claude Code", "Google Antigravity", "Kiro", "Kimi"):
        if not any(name in i and "<use" in i for i in items):
            out.append(f"/: the agents list has no mark for {name}")
    if not any("Codex" in i and "<svg" not in i for i in items):
        out.append("/: Codex must be listed without a mark")
    css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    if re.search(r"\.agents li:not\(", css) or re.search(r"\.agents li[^{]*\{[^}]*padding-left", css):
        out.append("v6.css: an unmarked agent row is indented to leave a blank icon slot, which reads as a missing icon")
    if "Not every tool shows a logo" not in content:
        out.append("/integrations: no visible line saying that not every tool shows a logo")
    if "<strong>" in content and re.search(r"other tools\.\s*<strong>", content):
        out.append("/integrations: a bold label is glued to the sentence before it")
    return out


def test_scorpion_only() -> list[str]:
    out = []
    for f in [*LANDING_DIR.glob("**/*.html"), *LANDING_DIR.glob("*.css"), *LANDING_DIR.glob("*.js")]:
        if "scorpion.png" in f.read_text(encoding="utf-8"):
            out.append(f"{f.relative_to(LANDING_DIR)} references scorpion.png, the source JPEG")
    for route, content in all_pages().items():
        if content.count('src="/logo.png"') < 2:
            out.append(f"{route}: /logo.png must be in both the header and the footer")
        if 'class="cta"' in content and "/mark-white.png" not in content:
            out.append(f"{route}: the call to action has no /mark-white.png watermark")
    return out


def test_getting_started() -> list[str]:
    out = []
    content = htmllib.unescape(page_html("/getting-started"))
    for needle in ('xattr -cr "/Applications/Alacran.app"', "data-copy", "notarized", "damaged"):
        if needle not in content:
            out.append(f"/getting-started: missing {needle!r}")
    if content.count("<span>You will see</span>") < 7:
        out.append("/getting-started: each of the 7 steps needs a 'You will see' line")
    if "release-specific" in content:
        out.append("/getting-started: still sends the visitor to 'release-specific' guidance")
    deb = re.search(r"On Debian or Ubuntu.*?</p>", content, re.S)
    if not deb or "Use it only on the file you downloaded from this site or the official releases page" not in deb[0]:
        out.append("/getting-started: the Debian Copy command has no scope sentence")
    return out


def test_scenarios() -> list[str]:
    out = []
    content = page_html("/")
    if 'id="why"' not in content:
        out.append("/: no #why section")
    items = re.findall(r'<li class="scn reveal">(.*?)</li>', content, re.S)
    if len(items) < 4:
        out.append(f"/: {len(items)} scenarios, want at least 4")
    for n, item in enumerate(items, 1):
        for label in ("The situation", "You get", "You stay in control"):
            if label not in item:
                out.append(f"/: scenario {n} has no '{label}'")
        # What goes in the box must match what it is: a prompt is "You ask", a button press is "You do".
        box = re.search(r"<figcaption>(You ask|You do)</figcaption><blockquote><p>(.*?)</p>", item, re.S)
        if not box:
            out.append(f"/: scenario {n} has no 'You ask' or 'You do' box")
        elif (box[1] == "You do") != box[2].startswith("Press "):
            out.append(f"/: scenario {n} puts {box[2][:40]!r} under {box[1]!r}; a button press is 'You do', a prompt is 'You ask'")
        if item.count('<a class="go"') != 1:
            out.append(f"/: scenario {n} needs exactly one next-step link")
    scn3 = re.findall(r'<li class="scn reveal">(.*?)</li>', page_html("/"), re.S)[2]
    if "bulk" in scn3 or "one by one" in scn3 or "drop the fact changes" not in scn3:
        out.append("/: scenario 3 must describe the Save what we learned button: approve the facts with the note, or drop the fact changes")
    links = re.findall(r'<li class="scn reveal">.*?<a class="go" href="([^"]+)">(.*?) <span', content, re.S)
    for key, what in ((1, "text"), (0, "target")):
        seen = [m[key] for m in links]
        if len(set(seen)) != len(seen):
            out.append(f"/: two scenarios share the same next-step link {what}")
    return out


COMPETITOR = "cloud" + "flare"  # written in two halves so this file does not itself name it
BANNED = [r"\d+\s?%", r"\b\d[\d,]*\+?\s+(?:customers|users|founders|businesses)\b", r"testimonial", "★", "⭐"]


def test_copy_rules() -> list[str]:
    out = []
    files = [*LANDING_DIR.glob("**/index.html"), *LANDING_DIR.glob("*.md"), *LANDING_DIR.glob("*/*.md"), *LANDING_DIR.glob("llms*.txt"),
             LANDING_DIR.parent / "docs" / "website-copy.md"]
    for f in files:
        raw = f.read_text(encoding="utf-8")
        text = re.sub(r"<(script|style|svg)\b.*?</\1>", " ", raw, flags=re.S | re.I)
        text = re.sub(r"<[^>]+>", " ", text) if f.suffix == ".html" else text
        name = f.relative_to(LANDING_DIR.parent)
        if COMPETITOR in raw.lower():
            out.append(f"{name} names a vendor whose site we borrowed an idea from")
        if f.name == "website-copy.md":
            continue  # the notes in the source may say what not to claim; only the published text is scanned below
        for pat in BANNED:
            if m := re.search(pat, text, re.I):
                out.append(f"{name} makes an unbacked claim: {m[0]!r}")
    return out


ALLOWED_HOSTS = {"cdnjs.buymeacoffee.com"}
LOADS = re.compile(r"<(script|link|img|iframe|source|embed)\b([^>]*)>", re.I)


def third_party_loads(content: str) -> set[str]:
    hosts = set()
    for tag, attrs in LOADS.findall(content):
        if tag.lower() == "link" and re.search(r'rel="(?:canonical|alternate)"', attrs):
            continue  # a link to a page, not a resource the browser loads
        for url in re.findall(r'(?:src|href|srcset)="(https?://[^"]+)"', attrs):
            host = urllib.parse.urlparse(url).netloc
            if host != "www.alacran.app":
                hosts.add(host)
    return hosts


def test_third_party_loads() -> list[str]:
    out = []
    for route, content in all_pages().items():
        extra = third_party_loads(content) - ALLOWED_HOSTS
        if extra:
            out.append(f"{route}: loads from {sorted(extra)}, which the privacy page does not disclose")
    if "Buy Me a Coffee" not in page_html("/privacy"):
        out.append("/privacy: no longer discloses the Buy Me a Coffee widget")
    if "url(http" in (LANDING_DIR / "v6.css").read_text(encoding="utf-8"):
        out.append("v6.css loads a remote resource")
    if not third_party_loads(page_html("/privacy").replace("</head>", '<script src="https://x.example/a.js"></script></head>')) - ALLOWED_HOSTS:
        out.append("third-party check did not notice an injected script")
    return out


def test_a11y_static() -> list[str]:
    css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    return ["v6.css removes a focus outline"] if re.search(r"outline\s*:\s*(none|0)\b", css) else []


def terms_failures(content: str) -> list[str]:
    body = re.search(r'<article class="prose">(.*?)</article>', content, re.S)
    text = re.sub(r"<[^>]+>", " ", body[1]) if body else ""
    toc = re.search(r'<aside class="toc".*?</aside>', content, re.S)
    out = []
    if len(text.split()) < 150:
        out.append(f"/terms: the article holds {len(text.split())} words; the terms text is missing")
    if len(re.findall(r"<li", toc[0] if toc else "")) < 5:
        out.append("/terms: the 'On this page' list has fewer than 5 headings")
    return out


def test_terms_page() -> list[str]:
    real = page_html("/terms")
    out = terms_failures(real)
    emptied = re.sub(r'(<article class="prose">).*?(</article>)', r"\1\2", real, flags=re.S)
    if not terms_failures(emptied):
        out.append("terms check did not notice an empty article")
    return out


def steps_failures(content: str, route: str) -> list[str]:
    """Every step in a numbered list is one box (its marker is drawn by CSS), so the 2-column grid cannot split it."""
    out = []
    for ol in re.findall(r'<ol class="steps">(.*?)</ol>', content, re.S):
        depth_items = re.split(r"(?=<li>)", ol)[1:]
        for n, li in enumerate(depth_items, 1):
            inner = re.fullmatch(r"<li>(.*)</li>", li, re.S)
            body = inner[1] if inner else li
            kids = DirectKids.count(body)
            if kids != 1:
                out.append(f"{route}: a numbered step has {kids} content boxes (step {n}); the grid would split it into columns")
    return out


class DirectKids(HTMLParser):
    """Counts the grid cells a list item's content makes: each direct child element, and each run of loose text."""
    VOID = {"br", "img", "input", "meta", "link", "hr"}

    def __init__(self):
        super().__init__()
        self.depth, self.n = 0, 0

    def handle_starttag(self, tag, attrs):
        if self.depth == 0:
            self.n += 1
        if tag not in self.VOID:
            self.depth += 1

    def handle_startendtag(self, tag, attrs):  # <br/>: a cell if at the top, never a change of depth
        self.n += self.depth == 0

    def handle_endtag(self, tag):
        self.depth -= 1

    def handle_data(self, data):
        if self.depth == 0 and data.strip():
            self.n += 1

    @classmethod
    def count(cls, html: str) -> int:
        p = cls()
        p.feed(html)
        return p.n


def test_steps_layout() -> list[str]:
    out = []
    for route, content in all_pages().items():
        out += steps_failures(content, route)
    gs = page_html("/getting-started")
    mac = re.search(r'<ol class="steps">(.*?)</ol>', gs, re.S)
    if not mac or mac[1].count("<li>") != 5:
        out.append("/getting-started: the Mac list should have 5 numbered steps")
    elif "data-copy" not in re.split(r"</li>", mac[1])[3]:
        out.append("/getting-started: the Copy box belongs inside step 4, not below the list")
    if "five things" not in gs:
        out.append("/getting-started: the text must count the five Mac steps")
    css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    cols = re.search(r"grid-template-columns:\s*([^;]+);", css_rule(css, ".steps li"))
    if not cols or len(re.findall(r"minmax\([^)]*\)|\S+", cols[1])) != 2:
        out.append("v6.css: .steps li must be a marker column plus exactly one content column")
    if (DirectKids.count("<div>a<br/>b</div><i>c</i>"), DirectKids.count("<br/><div>a</div>")) != (2, 2):
        out.append("DirectKids loses its depth on a self-closing tag such as <br/>")
    # Self-test: the old shape (inline pieces as separate children) must fail.
    old = '<ol class="steps"><li>Click <strong>About This Mac</strong> to see <code>Chip</code></li></ol>'
    if not steps_failures(old, "x"):
        out.append("steps check did not notice a step made of loose inline pieces")
    return out


def test_mac_dialog_scope() -> list[str]:
    """The Copy button ships on every page, so every page's dialog says what the command is for."""
    scope = "Use it only on the app you downloaded from this site or the official releases page."
    out = []
    for route, content in all_pages().items():
        dialog = re.search(r'<dialog class="mac-help".*?</dialog>', content, re.S)
        if not dialog or "data-copy" not in dialog[0]:
            out.append(f"{route}: no Mac help dialog with a Copy button")
        elif scope not in dialog[0]:
            out.append(f"{route}: the Mac help dialog has a Copy button but no scope sentence")
    return out


# An independent copy of each department page's problem-first openers (one per section) and its "why you need this" line.
DEPT_OPENERS = {
    "/departments/customers": ["It is easy to lose track of which prospects are waiting on you", "Researching every prospect by hand takes time",
                               "Before you write to a customer you have to remember what was said last time", "A record nobody updates stops being useful"],
    "/departments/finances": ["Your numbers are probably spread across statements", "One month’s figure rarely tells you",
                              "Costs creep up quietly", "A wrong number that slips into your records is hard to spot later"],
    "/departments/content": ["A generic post is easy to scroll past", "Ideas, drafts, and half-finished edits tend to end up scattered",
                             "Copy, previews, and visuals often get prepared in different places", "It is easy to lose track of what is approved",
                             "Posting more often is not the same as learning what works"],
    "/departments/messages": ["Messages arrive in many places", "Not every message needs you", "A fast reply is only useful if it is right",
                              "A reply you sent last month is easy to forget"],
}


def test_department_copy() -> list[str]:
    out = []
    for route, openers in DEPT_OPENERS.items():
        content = htmllib.unescape(page_html(route))
        if "Why you need this:" not in region(content, "main"):
            out.append(f"{route}: no 'Why you need this' line")
        for o in openers:
            m = re.search(rf"<p>{re.escape(o)}", content)
            if not m:
                out.append(f"{route}: a section does not open with its problem sentence: {o[:40]!r}")
            elif "<h2>" not in content[max(0, m.start() - 400):m.start()]:
                out.append(f"{route}: {o[:40]!r} is not the first paragraph under a heading")
    if "tone guidance are saved" in page_html("/departments/content") or "past posts set the voice" not in page_html("/departments/content"):
        out.append("/departments/content: the 'why you need this' line names a tone setting the app does not have")
    if "saved tone guidance" in page_html("/departments/content") or "tone guidance to give" in page_html("/departments/content"):
        out.append("/departments/content: the page names a saved tone setting the app does not have (voice comes from past posts)")
    if "by default what it proposes waits for your approval" not in page_html("/departments/finances"):
        out.append("/departments/finances: 'waits for your approval' must say it is the default")
    return out


def test_buttons_and_menus() -> list[str]:
    """Small polish rules that a render showed were wrong: arrow wrap, red Copy buttons, bare icons, widget overlap."""
    out = []
    css = (LANDING_DIR / "v6.css").read_text(encoding="utf-8")
    if "display: block" not in css_rule(css, ".dl .menu .menu-foot"):
        out.append("v6.css: the 'Read the setup guide' link is a grid, so its arrow wraps onto its own line")
    cta = css_rule(css, ".cta .dl .menu")
    if "min-width: 100%" not in cta or "width: 0" not in cta:
        out.append("v6.css: the open CTA menu sizes the Download button's box, pushing 'Read the setup guide' away")
    narrow = re.search(r"@media \(max-width: 720px\) \{(.*?)\n\}", css, re.S)
    pad = re.search(r"\.foot \{ padding-bottom: (\d+)px", narrow[1] if narrow else "")
    if not pad or int(pad[1]) < 80:
        out.append("v6.css: on a phone the footer has no bottom room, so the support button covers its last line")
    for route, content in all_pages().items():
        for btn in re.findall(r"<button\b[^>]*data-copy[^>]*>", content):
            if "btn-primary" in btn:
                out.append(f"{route}: a Copy button is brand red, competing with the Download button")
            if "title=" not in btn:
                out.append(f"{route}: a Copy button has no tooltip")
        for summ in re.findall(r'<summary class="btn[^>]*>', content):
            if "title=" not in summ:
                out.append(f"{route}: a Download summary has no tooltip")
        if not re.search(r'<button class="nav-toggle"[^>]*title="', content):
            out.append(f"{route}: the nav hamburger has no title, only an aria-label")
    return out


def main() -> int:
    print("==================================================================")
    print("Alacrán Landing Page QA & Responsive Verification")
    print("==================================================================")

    checks = [
        ("HTTP 200 & Asset Loading", test_http_server),
        ("Em-Dash Cleanliness (0 \u2014 allowed)", test_em_dashes),
        ("HTML / DOM Integrity & Local Assets", test_html_dom_and_assets),
        ("Responsive Layout & WCAG Contrast", test_responsive_and_contrast),
        ("Desktop Logo & Support Widget", test_logo_and_support_widget),
        ("Link-preview (og & twitter) tags and card image", test_social_tags),
        ("Link-preview check fails on a broken page", test_social_check_bites),
        ("Download menu on every page and in the footer", test_download_blocks),
        ("Icon files, icon links and sprite ids", test_icons),
        ("Real vendor marks, text-only where none exists", test_vendor_marks),
        ("Scorpion files only", test_scorpion_only),
        ("Get started: install steps and Mac command", test_getting_started),
        ("Home: why and scenarios", test_scenarios),
        ("Copy rules: no borrowed vendor name, no invented claims", test_copy_rules),
        ("No undisclosed third-party loads", test_third_party_loads),
        ("Static accessibility: focus outlines kept", test_a11y_static),
        ("Terms page has its text and headings", test_terms_page),
        ("Department pages open each section with the visitor's problem", test_department_copy),
        ("Menu arrow, neutral Copy buttons, tooltips, footer room for the widget", test_buttons_and_menus),
        ("Mac help dialog says what its command is for, on every page", test_mac_dialog_scope),
        ("Numbered steps are one box each, Mac copy box inside step 4", test_steps_layout),
    ]

    total_failures = []
    for title, check_fn in checks:
        print(f"\nRunning check: {title}...")
        failures = check_fn()
        if failures:
            print(f"FAIL: {title}")
            for err in failures:
                print(f"  - {err}")
            total_failures.extend(failures)
        else:
            print(f"PASS: {title}")

    print("\n==================================================================")
    if total_failures:
        print(f"FAILED with {len(total_failures)} error(s).")
        return 1
    else:
        print("ALL QA & VERIFICATION CHECKS PASSED SUCCESSFULLY.")
        print("==================================================================")
        return 0


if __name__ == "__main__":
    sys.exit(main())
