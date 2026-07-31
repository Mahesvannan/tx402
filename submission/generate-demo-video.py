from __future__ import annotations

import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submission" / "out"
FRAMES = OUT / "frames"
FINAL = OUT / "tx402-demo-video.mp4"
FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"

WIDTH = 1920
HEIGHT = 1080

BG = (4, 8, 18)
CARD = (15, 23, 42)
CARD_2 = (22, 33, 58)
ACCENT = (45, 212, 191)
GREEN = (34, 197, 94)
YELLOW = (250, 204, 21)
RED = (248, 113, 113)
TEXT = (241, 245, 249)
MUTED = (148, 163, 184)
DIM = (71, 85, 105)
CODE_BG = (2, 6, 23)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


F_TITLE = font(76, True)
F_H1 = font(56, True)
F_H2 = font(38, True)
F_BODY = font(31)
F_BODY_BOLD = font(31, True)
F_SMALL = font(24)
F_CODE = font(26)
F_CODE_SMALL = font(22)
F_CAPTION = font(30, True)


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        if paragraph == "":
            lines.append("")
            continue
        words = paragraph.split()
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
    return lines


def text(draw, xy, value, fnt, fill=TEXT, max_width=None, line_gap=8) -> int:
    x, y = xy
    if max_width is None:
        draw.text((x, y), value, font=fnt, fill=fill)
        return y + fnt.size + line_gap
    for line in wrap(draw, value, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y


def rounded(draw, box, fill, outline=None, width=1, radius=28):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def base(title: str, eyebrow: str = "tx402 demo") -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, WIDTH, 10), fill=ACCENT)
    text(draw, (90, 60), eyebrow.upper(), F_SMALL, ACCENT)
    text(draw, (90, 100), title, F_H1, TEXT)
    draw.text((90, 1015), "Live: https://tx402-production.up.railway.app", font=F_SMALL, fill=MUTED)
    draw.text((1325, 1015), "github.com/Mahesvannan/tx402", font=F_SMALL, fill=MUTED)
    return img, draw


def caption(draw, value: str):
    rounded(draw, (90, 865, 1830, 975), CODE_BG, outline=ACCENT, width=2, radius=20)
    text(draw, (125, 895), value, F_CAPTION, TEXT, max_width=1660, line_gap=4)


def terminal(draw, box, title: str, lines: list[tuple[str, tuple[int, int, int]]]):
    x1, y1, x2, y2 = box
    rounded(draw, box, CODE_BG, outline=DIM, width=2, radius=22)
    draw.rectangle((x1, y1, x2, y1 + 58), fill=(10, 16, 30))
    draw.ellipse((x1 + 24, y1 + 22, x1 + 40, y1 + 38), fill=RED)
    draw.ellipse((x1 + 50, y1 + 22, x1 + 66, y1 + 38), fill=YELLOW)
    draw.ellipse((x1 + 76, y1 + 22, x1 + 92, y1 + 38), fill=GREEN)
    draw.text((x1 + 120, y1 + 18), title, font=F_SMALL, fill=MUTED)
    y = y1 + 85
    for line, color in lines:
        for wrapped in textwrap.wrap(line, width=88):
            draw.text((x1 + 30, y), wrapped, font=F_CODE, fill=color)
            y += 34
        y += 4


def browser(draw, box, title: str, body_lines: list[str]):
    x1, y1, x2, y2 = box
    rounded(draw, box, (248, 250, 252), radius=20)
    draw.rectangle((x1, y1, x2, y1 + 66), fill=(226, 232, 240))
    draw.ellipse((x1 + 24, y1 + 25, x1 + 42, y1 + 43), fill=RED)
    draw.ellipse((x1 + 54, y1 + 25, x1 + 72, y1 + 43), fill=YELLOW)
    draw.ellipse((x1 + 84, y1 + 25, x1 + 102, y1 + 43), fill=GREEN)
    rounded(draw, (x1 + 135, y1 + 18, x2 - 30, y1 + 50), (255, 255, 255), radius=12)
    draw.text((x1 + 155, y1 + 23), title, font=F_SMALL, fill=(30, 41, 59))
    y = y1 + 95
    for line in body_lines:
        draw.text((x1 + 35, y), line, font=F_CODE_SMALL, fill=(15, 23, 42))
        y += 32


def bullets(draw, items: list[str], x: int, y: int, max_width: int = 760) -> int:
    for item in items:
        draw.ellipse((x, y + 9, x + 18, y + 27), fill=ACCENT)
        y = text(draw, (x + 38, y), item, F_BODY, TEXT, max_width=max_width)
        y += 22
    return y


def slide_1() -> Image.Image:
    img, draw = base("tx402", "Algorand x402 API")
    draw.text((90, 210), "Plain-English transaction explanations", font=F_TITLE, fill=TEXT)
    draw.text((90, 300), "paid per call by AI agents using x402", font=F_TITLE, fill=ACCENT)
    rounded(draw, (90, 450, 920, 725), CARD, radius=30)
    rounded(draw, (1000, 450, 1830, 725), CARD, radius=30)
    bullets(
        draw,
        [
            "Input: one Algorand transaction ID",
            "Output: one readable sentence + JSON",
            "No LLM in the serving path",
        ],
        140,
        500,
    )
    bullets(
        draw,
        [
            "x402 payment challenge on /explain",
            "Algorand Mainnet USDC settlement",
            "Current price: $0.005 per call",
        ],
        1050,
        500,
    )
    caption(draw, "This demo shows a live paid API primitive for AI agents on Algorand.")
    return img


def slide_2() -> Image.Image:
    img, draw = base("Problem: raw chain data is not explanation-ready")
    terminal(
        draw,
        (90, 220, 895, 790),
        "raw Algorand indexer data",
        [
            ('"tx-type": "axfer"', MUTED),
            ('"asset-transfer-transaction": {', MUTED),
            ('  "amount": 12300000,', YELLOW),
            ('  "asset-id": 31566704,', YELLOW),
            ('  "receiver": "XOFKWH...U3DL3Q"', MUTED),
            ("}", MUTED),
            ('"note": "cmVudCBwYXltZW50"', YELLOW),
            ('"application-id": 1002541853', YELLOW),
        ],
    )
    rounded(draw, (1015, 220, 1830, 790), CARD, radius=26)
    text(draw, (1065, 270), "What apps and agents actually need", F_H2, TEXT)
    bullets(
        draw,
        [
            "Scaled amounts like 12.30 USDC",
            "Readable asset and app labels",
            "Decoded notes, fees, timestamps, and counterparties",
            "One explanation that can be shown to a user",
        ],
        1065,
        360,
        max_width=680,
    )
    caption(draw, "tx402 removes repetitive decoding work for wallets, agents, explorers, and compliance tools.")
    return img


def slide_3() -> Image.Image:
    img, draw = base("Solution: one txid in, explanation out")
    browser(
        draw,
        (90, 215, 1830, 760),
        "GET /explain?txid=7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ",
        [
            "{",
            '  "txid": "7MK6WLKFBPC323ATSEKNEKUTQZ23TCCM75SJNSFAHEM65GYJ5ANQ",',
            '  "network": "mainnet",',
            '  "summary": "On June 15, 2019, wallet I3345F...EUBEGU sent 0.10 ALGO to ALGORA...N5DNAU. Paid 0.001 ALGO in fees.",',
            '  "details": {',
            '    "type": "pay",',
            '    "transfer": { "amount": "0.10", "unit": "ALGO" }',
            "  }",
            "}",
        ],
    )
    caption(draw, "The response is both human-readable and structured for downstream applications.")
    return img


def slide_4() -> Image.Image:
    img, draw = base("Live production checks")
    terminal(
        draw,
        (90, 215, 1830, 790),
        "PowerShell - production smoke test",
        [
            ("$env:TX402_URL='https://tx402-production.up.railway.app'", ACCENT),
            ("$env:DEEP_HEALTH_NETWORK='mainnet'", ACCENT),
            ("npm run smoke", TEXT),
            ("", TEXT),
            ("Smoke testing https://tx402-production.up.railway.app", MUTED),
            ("PASS /health -> 200", GREEN),
            ("PASS /health?deep=1 -> 200", GREEN),
            ("PASS /discovery -> 200 (priced=true, price=$0.005)", GREEN),
            ("PASS /explain unpaid challenge -> 402", GREEN),
            ("Smoke test complete.", GREEN),
        ],
    )
    caption(draw, "The live deployment is healthy and correctly returns HTTP 402 for unpaid /explain calls.")
    return img


def slide_5() -> Image.Image:
    img, draw = base("x402 payment challenge on Algorand")
    terminal(
        draw,
        (90, 215, 1830, 790),
        "npm run example:client",
        [
            ("tx402: https://tx402-production.up.railway.app", TEXT),
            ("Discovery: priced=true, price=$0.005", GREEN),
            ("HTTP 402", YELLOW),
            ('"scheme": "exact"', MUTED),
            ('"network": "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8="', MUTED),
            ('"amount": "5000"', ACCENT),
            ('"asset": "31566704"', ACCENT),
            ('"payTo": "6RK3U3OF2B4Q773L4KC7OVFHQGU5I74NHRZ36QN6CVF527CKXAL62YR754"', MUTED),
            ('"decimals": 6', MUTED),
        ],
    )
    caption(draw, "The client is read-only by default: it shows payment requirements without spending funds.")
    return img


def slide_6() -> Image.Image:
    img, draw = base("Developer integration surface")
    rounded(draw, (90, 220, 560, 720), CARD, radius=24)
    rounded(draw, (725, 220, 1195, 720), CARD, radius=24)
    rounded(draw, (1360, 220, 1830, 720), CARD, radius=24)
    text(draw, (135, 280), "OpenAPI", F_H2, ACCENT)
    text(draw, (770, 280), "Node client", F_H2, ACCENT)
    text(draw, (1405, 280), "MCP wrapper", F_H2, ACCENT)
    text(draw, (135, 365), "/openapi.json\nOpenAPI 3.1 spec for regular API integrations.", F_BODY, TEXT, max_width=370)
    text(draw, (770, 365), "examples/node-client.mjs\nSafe read-only default, optional paid mode.", F_BODY, TEXT, max_width=370)
    text(draw, (1405, 365), "mcp/tx402-mcp.mjs\nAgent-facing stdio tool wrapper.", F_BODY, TEXT, max_width=370)
    caption(draw, "Phase 6 ships the API, documentation, OpenAPI spec, example client, and MCP wrapper.")
    return img


def slide_7() -> Image.Image:
    img, draw = base("Mainnet settlement proof")
    rounded(draw, (90, 235, 1830, 760), CARD, radius=28)
    text(draw, (145, 300), "First real x402 settlement", F_H2, TEXT)
    bullets(
        draw,
        [
            "Network: Algorand Mainnet",
            "Asset: USDC, asset ID 31566704",
            "Amount: 0.005000 USDC",
            "Receiver balance: 3.350000 -> 3.355000 USDC",
        ],
        145,
        390,
        max_width=760,
    )
    text(draw, (1000, 390), "Settlement TxID", F_H2, ACCENT)
    text(
        draw,
        (1000, 470),
        "XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA",
        F_BODY_BOLD,
        TEXT,
        max_width=720,
    )
    caption(draw, "tx402 is not just a mockup: it has settled a real Mainnet x402 payment.")
    return img


def slide_8() -> Image.Image:
    img, draw = base("Submission summary")
    rounded(draw, (90, 230, 1830, 760), CARD, radius=28)
    bullets(
        draw,
        [
            "Project: tx402",
            "One-liner: plain-English Algorand transaction explanations, paid per call by AI agents.",
            "Target users: AI agents, developers, wallets, portfolio trackers, explorers, and compliance tools.",
            "Live URL: https://tx402-production.up.railway.app",
            "Repository: https://github.com/Mahesvannan/tx402",
        ],
        145,
        300,
        max_width=1510,
    )
    caption(draw, "tx402 demonstrates x402 as a practical payment layer for agent-accessible APIs on Algorand.")
    return img


slides = [
    ("01-title", slide_1, 20),
    ("02-problem", slide_2, 25),
    ("03-solution", slide_3, 28),
    ("04-live-checks", slide_4, 30),
    ("05-payment-challenge", slide_5, 32),
    ("06-integrations", slide_6, 26),
    ("07-settlement", slide_7, 30),
    ("08-summary", slide_8, 24),
]


def run_ffmpeg(args: list[str]) -> None:
    subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", *args], check=True)


def make_segment(index: int, name: str, image: Image.Image, duration: int) -> Path:
    png = FRAMES / f"{index + 1:02d}-{name}.png"
    mp4 = FRAMES / f"{index + 1:02d}-{name}.mp4"
    image.save(png)
    run_ffmpeg(
        [
            "-y",
            "-loop",
            "1",
            "-i",
            str(png),
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-t",
            str(duration),
            "-vf",
            "scale=1920:1080,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-shortest",
            str(mp4),
        ]
    )
    return mp4


def main() -> None:
    if not FFMPEG.exists():
        raise SystemExit(f"ffmpeg binary not found: {FFMPEG}")

    FRAMES.mkdir(parents=True, exist_ok=True)
    segments = [make_segment(i, name, factory(), duration) for i, (name, factory, duration) in enumerate(slides)]

    concat = OUT / "concat.txt"
    concat.write_text("\n".join(f"file '{segment.as_posix()}'" for segment in segments), encoding="utf-8")

    run_ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(FINAL)])

    probe = subprocess.run(
        [str(FFMPEG), "-hide_banner", "-i", str(FINAL)],
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    metadata = {
        "video": str(FINAL),
        "slides": len(slides),
        "duration_target_seconds": sum(duration for _, _, duration in slides),
        "bytes": FINAL.stat().st_size,
        "ffmpeg_probe": "\n".join(probe.stderr.splitlines()[:12]),
    }
    (OUT / "video-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
