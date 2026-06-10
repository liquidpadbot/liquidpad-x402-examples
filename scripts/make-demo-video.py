#!/usr/bin/env python3
"""
Frame-as-code HD demo video for the LiquidPad x402 inference endpoint.

No screen recording, no editor. Each frame is an SVG rendered to PNG via
rsvg-convert, then stitched to 1080p60 MP4 with ffmpeg.

Content: a terminal types the pay-per-inference command, shows the 402
handshake, the payment, and the completion + settlement receipt — matching
the real behaviour of POST /api/x402/inference.

Style: dark #040912 bg, cyan #20dbff + blue #5082ff accents, DejaVu Sans Mono.
Status dots are SVG circles (no emoji font on this box).

Output: ../demo-video.mp4
"""

import os
import shutil
import subprocess
import html

# ─── Geometry ──────────────────────────────────────────────────────────────
VIEW_W, VIEW_H = 1280, 720
RENDER_W, RENDER_H = 1920, 1080
FPS = 60

FRAMES_DIR = os.path.join(os.path.dirname(__file__), "_frames")
OUT = os.path.join(os.path.dirname(__file__), "..", "demo-video.mp4")

PAD_X = 64
TERM_TOP = 132
LINE_H = 30
FONT = "DejaVu Sans Mono, monospace"
FONT_SIZE = 19

# ─── Colors ──────────────────────────────────────────────────────────────
BG0 = "#070e1a"
BG1 = "#040912"
CYAN = "#20dbff"
BLUE = "#5082ff"
GREEN = "#31ffa0"
RED = "#ff6b6b"
DIM = "#7289aa"
FG = "#eaf2ff"
MUTE = "#a9bad6"

# ─── Script: ordered terminal lines ────────────────────────────────────────
# Each entry: (kind, text, color)
#   kind "type"  → typed char-by-char with prompt prefix
#   kind "out"   → appears (fade-in), no typing
#   kind "blank" → spacer
PROMPT = "$ "

SCRIPT = [
    ("type", "export PRIVATE_KEY=0x…   # funded with USDC on Base", FG),
    ("type", "node inference.mjs \"explain x402 in one sentence\"", FG),
    ("blank", "", ""),
    ("out", "payer wallet:  0x9a3f…71c4", MUTE),
    ("out", "\u2192 POST liquidpad.site/api/x402/inference", MUTE),
    ("out", "\u2190 HTTP 402  Payment Required", RED),
    ("out", "  quote: $0.01 USDC \u00b7 Base \u00b7 scheme exact", DIM),
    ("out", "\u2192 signing EIP-3009 authorization\u2026", MUTE),
    ("out", "\u2192 settling via Coinbase facilitator\u2026", MUTE),
    ("blank", "", ""),
    ("out", "\u2190 HTTP 200", GREEN),
    ("ai", "x402 lets a client pay for an HTTP request", CYAN),
    ("ai", "with on-chain USDC instead of an API key.", CYAN),
    ("blank", "", ""),
    ("out", "settled tx: 0xa1f2…3c4d   cost: $0.01 USDC", BLUE),
]

# Animation timing
CHARS_PER_FRAME_STEP = 2   # 2 frames per typed char
FADE_FRAMES = 10           # fade-in length for "out" lines
LINE_GAP_FRAMES = 6        # pause between lines
HOLD_FRAMES = 160          # end hold for loop readability


def esc(s):
    return html.escape(s, quote=True)


def svg_header():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VIEW_W} {VIEW_H}" width="{VIEW_W}" height="{VIEW_H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="{BG0}"/>
    <stop offset="100%" stop-color="{BG1}"/>
  </linearGradient>
  <radialGradient id="glow" cx="18%" cy="12%" r="60%">
    <stop offset="0%" stop-color="{CYAN}" stop-opacity="0.10"/>
    <stop offset="100%" stop-color="{CYAN}" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect width="{VIEW_W}" height="{VIEW_H}" fill="url(#bg)"/>
<rect width="{VIEW_W}" height="{VIEW_H}" fill="url(#glow)"/>'''


def window_chrome():
    # Title bar + traffic lights + brand
    return f'''
<rect x="40" y="40" width="{VIEW_W-80}" height="{VIEW_H-80}" rx="16" fill="#060c18" stroke="#1b2740" stroke-width="1"/>
<circle cx="72" cy="76" r="6" fill="#ff5f57"/>
<circle cx="94" cy="76" r="6" fill="#febc2e"/>
<circle cx="116" cy="76" r="6" fill="#28c840"/>
<text x="{VIEW_W/2}" y="81" text-anchor="middle" font-family="{FONT}" font-size="15" fill="{DIM}">liquidpad.site/api/x402/inference \u00b7 pay-per-inference</text>
<circle cx="{VIEW_W-150}" cy="76" r="4" fill="{GREEN}"/>
<text x="{VIEW_W-138}" y="81" font-family="{FONT}" font-size="13" fill="{GREEN}" font-weight="bold">LIVE</text>
'''


def footer():
    return f'''
<text x="{PAD_X}" y="{VIEW_H-58}" font-family="{FONT}" font-size="14" fill="{DIM}">no API key \u00b7 no signup \u00b7 USDC on Base</text>
<text x="{VIEW_W-PAD_X}" y="{VIEW_H-58}" text-anchor="end" font-family="{FONT}" font-size="14" fill="{CYAN}">liquidpad.site/x402</text>
'''


def render_line(text, color, y, opacity=1.0, cursor=False, prompt=False, bold=False):
    out = ""
    x = PAD_X
    if prompt:
        out += f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{FONT_SIZE}" fill="{DIM}" xml:space="preserve">{esc(PROMPT)}</text>'
        x += len(PROMPT) * 11.4  # mono advance ~ at 19px
    weight = ' font-weight="bold"' if bold else ""
    if text:
        out += f'<text x="{x:.1f}" y="{y}" font-family="{FONT}" font-size="{FONT_SIZE}" fill="{color}" fill-opacity="{opacity:.3f}"{weight} xml:space="preserve">{esc(text)}</text>'
    if cursor:
        cx = x + len(text) * 11.4
        out += f'<rect x="{cx:.1f}" y="{y-15}" width="10" height="20" fill="{CYAN}" fill-opacity="{opacity:.3f}"/>'
    return out


def build_frames():
    if os.path.exists(FRAMES_DIR):
        shutil.rmtree(FRAMES_DIR)
    os.makedirs(FRAMES_DIR)

    # We accumulate "completed" lines as we go; the active line animates.
    frames = []  # each frame = list of (text,color,y,opacity,cursor,prompt,bold)
    completed = []  # finished lines: (text,color,kind)

    def emit_frame(active=None):
        items = []
        y = TERM_TOP
        for (t, c, kind) in completed:
            is_prompt = kind == "type"
            is_bold = kind in ("ai",)
            items.append((t, c, y, 1.0, False, is_prompt, is_bold))
            y += LINE_H
        if active is not None:
            atext, acolor, akind, aopacity, acursor = active
            is_prompt = akind == "type"
            is_bold = akind in ("ai",)
            items.append((atext, acolor, y, aopacity, acursor, is_prompt, is_bold))
        frames.append(items)

    blink = 0
    for (kind, text, color) in SCRIPT:
        if kind == "blank":
            completed.append(("", "", "blank"))
            continue

        if kind == "type":
            # type char by char
            for i in range(1, len(text) + 1):
                partial = text[:i]
                for _ in range(CHARS_PER_FRAME_STEP):
                    blink += 1
                    cur = (blink // 15) % 2 == 0
                    emit_frame((partial, color, kind, 1.0, cur))
            # small hold with blinking cursor
            for _ in range(LINE_GAP_FRAMES):
                blink += 1
                cur = (blink // 15) % 2 == 0
                emit_frame((text, color, kind, 1.0, cur))
            completed.append((text, color, kind))
        else:
            # out / ai: fade in
            for f in range(FADE_FRAMES):
                op = (f + 1) / FADE_FRAMES
                emit_frame((text, color, kind, op, False))
            for _ in range(LINE_GAP_FRAMES):
                emit_frame((text, color, kind, 1.0, False))
            completed.append((text, color, kind))

    # End hold
    for _ in range(HOLD_FRAMES):
        emit_frame(None)

    # Write SVG+PNG per frame
    head = svg_header()
    chrome = window_chrome()
    foot = footer()
    n = 0
    for items in frames:
        body = "".join(
            render_line(t, c, y, op, cur, pr, bd)
            for (t, c, y, op, cur, pr, bd) in items
        )
        svg = head + chrome + body + foot + "</svg>"
        svg_path = os.path.join(FRAMES_DIR, f"f_{n:05d}.svg")
        png_path = os.path.join(FRAMES_DIR, f"f_{n:05d}.png")
        with open(svg_path, "w") as fh:
            fh.write(svg)
        subprocess.run(
            ["rsvg-convert", "-w", str(RENDER_W), "-h", str(RENDER_H),
             svg_path, "-o", png_path],
            check=True,
        )
        os.remove(svg_path)
        n += 1

    return n


def stitch(n):
    cmd = [
        "ffmpeg", "-y", "-framerate", str(FPS),
        "-i", os.path.join(FRAMES_DIR, "f_%05d.png"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
        "-vf", "scale=1920:1080:flags=lanczos",
        "-movflags", "+faststart",
        OUT,
    ]
    subprocess.run(cmd, check=True)


def main():
    print("building frames…")
    n = build_frames()
    print(f"  {n} frames @ {FPS}fps = {n/FPS:.1f}s")
    print("stitching mp4…")
    stitch(n)
    print("cleaning up frames…")
    shutil.rmtree(FRAMES_DIR)
    print(f"done → {OUT}")


if __name__ == "__main__":
    main()
