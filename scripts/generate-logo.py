#!/usr/bin/env python3
"""Turn the supplied scorpion artwork into the red Alacrán logo.

    python3 scripts/generate-logo.py

Source:  landing/scorpion.png  (despite the name it is a JPEG: 840x916, RGB,
         NO alpha — what looks like transparency is a checkerboard pattern
         flattened into the image)

Outputs (committed, so the build needs neither PIL nor this script):
    landing/logo.png            600px wide, used by every landing page
    components/alacran-logo.png same bytes; statically imported by the app so
                                Next emits it into .next/static/media, which
                                scripts/package-macos.sh already copies
    landing/favicon.png         128px
    app/icon.png                512px (Next.js file convention; a browser
                                favicon source only now — see below for what
                                the Linux .deb's own icon actually uses)
    components/alacran-icon-master.png
    components/alacran-icon-512.png
                                1024x1024 and 512x512, both padded to a
                                square canvas and NOT colour-quantized
                                (unlike the four outputs above, these are
                                local packaging inputs, never served over a
                                network, so fidelity beats file size).
                                scripts/package-macos.sh's .icns and
                                scripts/package-linux.sh's hicolor icon both
                                downsample from these instead of upscaling a
                                small, non-square source — which is why both
                                platforms' app icons used to look blurry.

Two problems have to be solved to use this artwork on a dark surface:

1. KEYING. There is no alpha, and interior white highlights are exactly as
   bright as the background, so a luminance threshold would punch holes in the
   artwork. Instead every light region is labelled as a connected component and
   classified by the checkerboard signature: the background alternates 239/255,
   so ~50% of its pixels are "dim" (<247), whereas an interior highlight is
   uniformly white (<12% dim). Measured on the real file: the outer background
   is 54% dim and the two regions enclosed by the pincer loops are 55% and 50%
   dim, while every genuine highlight sits between 4% and 11%. That gap is what
   the BG_DIM_RATIO threshold splits.

2. COLOURING. The art is greyscale, so luminance is a natural shading ramp.
   It is gradient-mapped onto the brand's existing scorpion gradient — deep red
   in the outlines, brand red in the mid-tones, pale red in the highlights.
"""

import os
from collections import deque

import numpy as np
from PIL import Image

SRC = "landing/scorpion.png"

LIGHT_CUTOFF = 222   # >= this is a candidate background/highlight pixel
DIM_CUTOFF = 247     # a checkerboard "dim" pixel is below this
BG_DIM_RATIO = 0.30  # measured: background >= 0.50, highlights <= 0.11
FEATHER_HI, FEATHER_LO = 248, 190  # luminance ramp for the anti-aliased edge

# Gradient map — the brand's scorpion gradient, but with the darkest stop
# lifted from #8c0f1c to #a61426: against a near-black surface the original
# floor made the outlines disappear and the 20px nav mark read as a blob.
# Lifting further (#c01a2e) flattens the segmentation detail at large sizes.
RAMP = [(0, (166, 20, 38)), (140, (255, 46, 67)), (255, (255, 176, 184))]

PALETTE_COLOURS = 128  # 192 KB -> 36 KB with no visible loss on flat vector art


def label_light_components(a):
    """4-connected components of the light mask, via BFS (no scipy needed)."""
    h, w = a.shape
    light = a >= LIGHT_CUTOFF
    lab = np.full((h, w), -1, np.int32)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if not light[sy, sx] or lab[sy, sx] != -1:
                continue
            cid = len(comps)
            lab[sy, sx] = cid
            q = deque([(sy, sx)])
            size = dim = 0
            while q:
                y, x = q.popleft()
                size += 1
                if a[y, x] < DIM_CUTOFF:
                    dim += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and lab[ny, nx] == -1:
                        lab[ny, nx] = cid
                        q.append((ny, nx))
            comps.append({"size": size, "dim_ratio": dim / size})
    return lab, comps


def build_alpha(a, lab, comps):
    h, w = a.shape
    bg = np.zeros((h, w), bool)
    for cid, c in enumerate(comps):
        if c["dim_ratio"] >= BG_DIM_RATIO:
            bg |= lab == cid
    # anything touching the frame is background regardless of its texture
    edge_ids = set(lab[0].tolist()) | set(lab[-1].tolist()) | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
    for cid in edge_ids:
        if cid >= 0:
            bg |= lab == cid

    alpha = np.where(bg, 0.0, 1.0)

    # Feather the boundary: JPEG blurs background into outline over a pixel or
    # two, so ramp those by luminance instead of leaving a hard jaggy edge.
    nb = np.zeros((h, w), bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nb |= np.roll(bg, (dy, dx), (0, 1))
    border = nb & ~bg
    ramp = np.clip((FEATHER_HI - a) / (FEATHER_HI - FEATHER_LO), 0.0, 1.0)
    alpha = np.where(border, np.minimum(alpha, ramp), alpha)
    return alpha


def colourise(a):
    xs = [p[0] for p in RAMP]
    out = np.empty(a.shape + (3,), np.float64)
    for ch in range(3):
        out[..., ch] = np.interp(a, xs, [p[1][ch] for p in RAMP])
    return out


def main():
    grey = np.asarray(Image.open(SRC).convert("L")).astype(np.int16)
    lab, comps = label_light_components(grey)
    alpha = build_alpha(grey, lab, comps)

    bgc = sum(1 for c in comps if c["dim_ratio"] >= BG_DIM_RATIO)
    print(f"light components: {len(comps)} ({bgc} classified as background)")

    rgb = colourise(grey)
    rgba = np.dstack([rgb, alpha * 255.0]).round().clip(0, 255).astype(np.uint8)
    img = Image.fromarray(rgba)

    # trim dead margin so small renderings (a 20px nav mark) fill their box
    bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    img = img.crop(bbox)
    print(f"trimmed to {img.size[0]}x{img.size[1]} (from 840x916)")

    def save(path, width):
        h = max(1, round(img.size[1] * width / img.size[0]))
        # resample first, then quantise — quantising the full-size image and
        # scaling down would resample palette indices instead of colour
        out = img.resize((width, h), Image.LANCZOS).quantize(
            colors=PALETTE_COLOURS, method=Image.FASTOCTREE
        )
        out.save(path, optimize=True)
        kb = os.path.getsize(path) / 1024
        print(f"  wrote {path} ({width}x{h}, {kb:.0f} KB)")

    save("landing/logo.png", 600)
    save("components/alacran-logo.png", 600)
    save("landing/favicon.png", 128)
    save("app/icon.png", 512)

    # Padded to a square canvas (transparent, centered — same idea
    # scripts/package-macos.sh used to do with `sips -p` on a 600px source;
    # doing it once here, on the full-resolution non-quantized image, means
    # neither packaging script ever has to upscale a small master again, and
    # both platforms' OS-level icons come from one canonical square source
    # instead of two different ad hoc paths. 1024 exceeds the source's own
    # native detail (trimmed to 800x834 from an 840x916 photo), so this
    # tier alone can't be perfectly crisp — but it's a ~1.2x stretch instead
    # of the previous 1.7x (macOS) or 8x (Linux, which used to just stretch
    # the 128px favicon straight into a "512x512" icon bucket), and
    # downsampling from here for every smaller tier introduces no further
    # blur at all.
    # ponytail: true 1024px crispness needs higher-resolution source
    # artwork; rerun this script unchanged if scorpion.png is ever replaced
    # with one.
    side = max(img.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2), img)

    def save_square_icon(path, size):
        square.resize((size, size), Image.LANCZOS).save(path, optimize=True)
        kb = os.path.getsize(path) / 1024
        print(f"  wrote {path} ({size}x{size}, {kb:.0f} KB)")

    save_square_icon("components/alacran-icon-master.png", 1024)  # macOS .icns, up to the 512@2x tier
    save_square_icon("components/alacran-icon-512.png", 512)  # Linux .deb's hicolor/512x512 icon


if __name__ == "__main__":
    main()
