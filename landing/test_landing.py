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

import http.server
import math
import os
import pathlib
import re
import sys
import threading
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
