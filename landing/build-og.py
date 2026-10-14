#!/usr/bin/env python3
"""Draw og.png, the 1200x630 card link previews show (Slack, iMessage, X, LinkedIn): the receipt book on the desk.

Rerun after changing the headline, the palette or the Home screenshot. Needs
Pillow, fontTools and ImageMagick (`magick`, to rasterise mark.svg). The site's
own fonts are read from fonts/ (woff2 is unpacked to a temp dir for Pillow).
"""
import pathlib
import subprocess
import tempfile

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).parent
W, H = 1200, 630
DESK, PAPER, CANARY, PINK, INK, INK2, CARBON, SERIAL = (34, 54, 44), (247, 247, 242), (245, 230, 140), (243, 191, 205), (21, 25, 43), (61, 66, 89), (44, 52, 144), (196, 43, 43)  # same values as v5.css
HEADLINE = ["YOUR BUSINESS,", "ORGANIZED. YOUR", "AI, PUT TO WORK."]
TMP = pathlib.Path(tempfile.mkdtemp())


def ttf(name: str) -> str:
    out = TMP / f"{name}.ttf"
    f = TTFont(HERE / "fonts" / f"{name}.woff2")
    f.flavor = None
    f.save(out)
    return str(out)


def font(name: str, size: int, axes=None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(ttf(name), size)
    if axes:
        f.set_variation_by_axes(axes)  # Big Shoulders and Franklin: [weight]; Special Elite is static
    return f


def mark(color: str, width: int) -> Image.Image:
    png = TMP / "mark.png"
    svg = (HERE / "mark.svg").read_text().replace("currentColor", color)
    (TMP / "mark.svg").write_text(svg)
    subprocess.run(["magick", "-background", "none", "-density", "600", str(TMP / "mark.svg"), "-resize", f"{width}x", str(png)], check=True)
    return Image.open(png).convert("RGBA")


card = Image.new("RGB", (W, H), DESK)
d = ImageDraw.Draw(card)

# The receipt book: white original with the canary and pink copies peeking out behind it.
px, py, pw, ph = 70, 70, 640, 490
d.rectangle((px + 24, py + 26, px + pw + 24, py + ph + 26), fill=PINK)
d.rectangle((px + 12, py + 13, px + pw + 12, py + ph + 13), fill=CANARY)
d.rectangle((px, py, px + pw, py + ph), fill=PAPER)
for y in range(py + 26, py + ph - 10, 64):
    d.ellipse((px + 14, y - 7, px + 28, y + 7), fill=DESK)
m = mark("#c42b2b", 40)
card.paste(m, (px + 70, py + 34), m)
d.text((px + 120, py + 36), "ALACRÁN", font=font("bigshoulders", 34, [900]), fill=INK)
d.text((px + pw - 190, py + 38), "No.", font=font("specialelite", 20), fill=INK2)
d.text((px + pw - 150, py + 30), "00471", font=font("specialelite", 32), fill=SERIAL)
d.line((px + 70, py + 92, px + pw - 36, py + 92), fill=INK, width=3)
d.line((px + 70, py + 97, px + pw - 36, py + 97), fill=INK, width=1)
d.text((px + 70, py + 122), "THE AGENTIC BUSINESS ENVIRONMENT", font=font("franklin", 17, [800]), fill=SERIAL)
y = py + 160
for line in HEADLINE:
    d.text((px + 70 + 4, y + 4), line, font=font("bigshoulders", 78, [900]), fill=CANARY)
    d.text((px + 70, y), line, font=font("bigshoulders", 78, [900]), fill=INK)
    y += 74
d.text((px + 70, y + 24), "Company knowledge, departments and AI agents", font=font("franklin", 22, [400]), fill=INK2)
d.text((px + 70, y + 54), "in one workspace you own.", font=font("franklin", 22, [400]), fill=INK2)

# A taped print of the real Home screen on the desk.
shot = Image.open(HERE / "screens" / "home-1200.webp").convert("RGB")
shot = shot.resize((430, int(430 * shot.height / shot.width)))
sx, sy = 752, 210
d.rectangle((sx - 12, sy - 12, sx + shot.width + 12, sy + shot.height + 12), fill=PAPER)
card.paste(shot, (sx, sy))
tape = Image.new("RGBA", (96, 28), (240, 222, 160, 215)).rotate(38, expand=True)
card.paste(tape, (sx + shot.width - 40, sy - 52), tape)
tape2 = Image.new("RGBA", (96, 28), (240, 222, 160, 215)).rotate(-38, expand=True)
card.paste(tape2, (sx - 62, sy - 52), tape2)
d.text((70, 600), "Free for macOS and Linux  /  alacran.app", font=font("specialelite", 18), fill=(207, 214, 203))

card.save(HERE / "og.png", optimize=True)
print(f"wrote {HERE / 'og.png'}")
