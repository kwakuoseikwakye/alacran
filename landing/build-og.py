#!/usr/bin/env python3
"""Draw og.png, the 1200x630 card link previews show (Slack, iMessage, X, LinkedIn).

Rerun after changing the headline, the palette or the Home screenshot. Needs
Pillow and fontTools. The site's own font is read from fonts/ (woff2 is
unpacked to a temp dir for Pillow). Colours match v6.css.
"""
import pathlib
import tempfile

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = pathlib.Path(__file__).parent
W, H = 1200, 630
BG, SHEET, INK, INK2, RULE, RED = (244, 242, 238), (255, 255, 255), (23, 24, 28), (74, 76, 85), (227, 223, 215), (214, 32, 47)
HEADLINE = ["Your business,", "organized. Your", "AI, put to work."]
TMP = pathlib.Path(tempfile.mkdtemp())


def ttf(name: str) -> str:
    out = TMP / f"{name}.ttf"
    f = TTFont(HERE / "fonts" / f"{name}.woff2")
    f.flavor = None
    f.save(out)
    return str(out)


def onest(size: int, weight: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(ttf("onest"), size)
    f.set_variation_by_axes([weight])
    return f


card = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(card)

# The desktop app's scorpion and wordmark, top left.
logo = Image.open(HERE / "logo.png").convert("RGBA")
logo = logo.resize((54, round(54 * logo.height / logo.width)), Image.LANCZOS)
card.paste(logo, (72, 62), logo)
d.text((142, 70), "Alacrán", font=onest(36, 600), fill=INK)

y = 188
for line in HEADLINE:
    d.text((72, y), line, font=onest(70, 300), fill=INK)
    y += 78
d.text((72, y + 22), "Company knowledge, departments and AI agents", font=onest(24, 400), fill=INK2)
d.text((72, y + 56), "in one workspace you own.", font=onest(24, 400), fill=INK2)
d.rounded_rectangle((72, 548, 330, 598), radius=10, fill=RED)
d.text((201, 573), "Download Alacrán", font=onest(21, 500), fill=(255, 255, 255), anchor="mm")
d.text((354, 573), "Free for macOS and Linux", font=onest(20, 400), fill=INK2, anchor="lm")

# A real screenshot of the Home screen in a window frame.
shot = Image.open(HERE / "screens" / "home-1200.webp").convert("RGB")
sw = 520
shot = shot.resize((sw, int(sw * shot.height / shot.width)), Image.LANCZOS)
fx, fy, bar = 640, 150, 30
fw, fh = sw, shot.height + bar
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle((fx, fy + 14, fx + fw, fy + fh + 14), radius=14, fill=(23, 24, 28, 60))
blur = shadow.filter(ImageFilter.GaussianBlur(18))
card.paste(blur, (0, 0), blur)
d = ImageDraw.Draw(card)
d.rounded_rectangle((fx, fy, fx + fw, fy + fh), radius=14, fill=SHEET, outline=RULE)
for k in range(3):
    d.ellipse((fx + 16 + k * 18, fy + 11, fx + 26 + k * 18, fy + 21), fill=(210, 205, 194))
mask = Image.new("L", (fw, fh - bar), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, -20, fw - 1, fh - bar - 1), radius=14, fill=255)
card.paste(shot, (fx, fy + bar), mask)
d.text((fx + fw // 2, fy + 16), "Alacrán", font=onest(13, 400), fill=INK2, anchor="mm")

card.save(HERE / "og.png", optimize=True)
print(f"wrote {HERE / 'og.png'}")
