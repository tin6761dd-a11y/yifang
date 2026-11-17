#!/usr/bin/env python3
"""Generate favicon.png and apple-touch-icon.png from store.logoChar."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_PATH = Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc")
FONT_INDEX = 3  # Noto Sans CJK TC Bold
BLUE = (29, 78, 216)
WHITE = (255, 255, 255)
# Match the previous 益 badge visual size on the 180px apple-touch icon.
ONE_CHAR_FRAC = 0.52
TWO_CHAR_FRAC = 0.36


def logo_char(store: dict | None) -> str:
    store = store or {}
    raw = str(store.get("logoChar") or store.get("mark") or "維").strip()
    chars = []
    for ch in raw:
        chars.append(ch)
        if len(chars) == 2:
            break
    return "".join(chars) or "維"


def render_icon(size: int, char: str) -> Image.Image:
    im = Image.new("RGB", (size, size), BLUE)
    draw = ImageDraw.Draw(im)
    frac = TWO_CHAR_FRAC if len(char) > 1 else ONE_CHAR_FRAC
    font_size = max(8, int(round(size * frac)))
    font = ImageFont.truetype(str(FONT_PATH), font_size, index=FONT_INDEX)
    # Slight optical downward shift so CJK glyphs sit optically centered.
    x, y = size / 2, size / 2 + size * 0.02
    draw.text((x, y), char, font=font, fill=WHITE, anchor="mm")
    return im


def generate(root: Path | None = None) -> dict:
    root = Path(root) if root else ROOT
    content = json.loads((root / "content.json").read_text(encoding="utf-8"))
    char = logo_char(content.get("store") or {})
    if not FONT_PATH.exists():
        raise SystemExit(f"Missing CJK font: {FONT_PATH}")
    favicon = root / "favicon.png"
    touch = root / "apple-touch-icon.png"
    render_icon(32, char).save(favicon, format="PNG", optimize=True)
    render_icon(180, char).save(touch, format="PNG", optimize=True)
    return {"char": char, "favicon": str(favicon), "apple": str(touch)}


if __name__ == "__main__":
    info = generate(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT)
    print(f"Generated icons for '{info['char']}': favicon.png, apple-touch-icon.png")
