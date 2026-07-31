from __future__ import annotations

import json
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "submission" / "out"
SLIDES = OUT / "slides"
AUDIO = OUT / "audio"
VIDEO = OUT / "video"
FINAL = OUT / "tx402-demo-video.mp4"
FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"


WIDTH = 1920
HEIGHT = 1080
BG = (9, 14, 27)
PANEL = (17, 24, 39)
ACCENT = (44, 212, 191)
TEXT = (241, 245, 249)
MUTED = (148, 163, 184)
CODE_BG = (2, 6, 23)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


TITLE = font(76, True)
SUBTITLE = font(40, False)
BODY = font(34, False)
BODY_BOLD = font(34, True)
SMALL = font(25, False)
CODE = font(28, False)


slides = [
    {
        "title": "tx402",
        "duration": 35,
        "subtitle": "Plain-English Algorand transaction explanations, paid per call by AI agents using x402.",
        "bullets": [
            "Live API: https://tx402-production.up.railway.app",
            "GitHub: github.com/Mahesvannan/tx402",
            "Mainnet x402 payments in USDC",
        ],
        "callout": "Give it a txid. Pay with x402. Get a readable explanation.",
        "narration": (
            "Hi, this is tx402. It turns cryptic Algorand transaction data into plain-English explanations, "
            "and the API is paid per call using x402 on Algorand. The service is live on Railway, has a public "
            "GitHub repository, and is configured for Mainnet USDC payments."
        ),
    },
    {
        "title": "The problem",
        "duration": 40,
        "subtitle": "Raw transaction data is correct, but hard to explain to people.",
        "bullets": [
            "Amounts arrive in base units, not readable decimals.",
            "Assets and applications are numeric IDs.",
            "Notes, fees, groups, and counterparties need decoding.",
            "Every agent should not rebuild the same chain-decoding layer.",
        ],
        "callout": "Agents need a small, reliable translation layer.",
        "narration": (
            "Algorand transaction data is optimized for precise machine processing. But when an AI agent, wallet, "
            "portfolio tracker, or compliance workflow needs to answer a human, the raw fields are not enough. "
            "Amounts need scaling, asset IDs need labels, notes need decoding, and app calls need context."
        ),
    },
    {
        "title": "The solution",
        "duration": 38,
        "subtitle": "A deterministic transaction explainer API.",
        "bullets": [
            "Input: one Algorand transaction ID.",
            "Output: one clear sentence plus structured JSON.",
            "Handles ALGO, ASA transfers, opt-ins, fees, timestamps, and notes.",
            "No LLM required in the serving path.",
        ],
        "callout": "Example: Wallet ABC sent 12.30 USDC to wallet XYZ.",
        "narration": (
            "tx402 accepts a transaction ID and returns a concise explanation plus structured fields. "
            "It normalizes amounts, identifies assets, decodes notes, and reports fees and counterparties. "
            "The output is deterministic, fast, and safe to call from other applications."
        ),
    },
    {
        "title": "How x402 fits",
        "duration": 42,
        "subtitle": "The explanation endpoint is monetized with x402 on Algorand.",
        "bullets": [
            "Agent calls GET /explain?txid=...",
            "API returns an HTTP 402 payment challenge.",
            "Buyer signs an Algorand USDC payment client-side.",
            "Facilitator verifies and settles.",
            "API returns the explanation after payment.",
        ],
        "callout": "Current price: $0.005 USDC per explanation.",
        "narration": (
            "The paid endpoint uses x402. An unpaid call receives a standard HTTP 402 challenge. "
            "The buyer signs a USDC payment on Algorand, the facilitator verifies and settles it, "
            "and the API returns the transaction explanation. The current price is half a cent per call."
        ),
    },
    {
        "title": "Live product",
        "duration": 38,
        "subtitle": "Production endpoints and developer integrations are ready.",
        "bullets": [
            "/health checks service liveness.",
            "/discovery exposes route pricing metadata.",
            "/openapi.json exposes an OpenAPI 3.1 spec.",
            "/explain returns paid transaction explanations.",
            "Includes Node client example and MCP stdio wrapper.",
        ],
        "callout": "Read-only client demo prints the payment challenge safely.",
        "narration": (
            "The production API exposes health, discovery, OpenAPI, and explain routes. "
            "For developers and agents, the repo includes a Node client example and an MCP stdio wrapper. "
            "Both are read-only by default, so they can inspect the payment challenge without spending funds."
        ),
    },
    {
        "title": "Proof and next steps",
        "duration": 37,
        "subtitle": "tx402 is deployed and has completed a real Mainnet settlement.",
        "bullets": [
            "Public HTTPS deployment on Railway.",
            "Algorand Mainnet USDC x402 configuration.",
            "First real Mainnet settlement: 0.005000 USDC.",
            "Settlement TxID: XA7HMRPUV4X2GWI4AAGUT5FKAVTNCQJ5ZMUNTVTBKG3GZMES27LA",
        ],
        "callout": "Next: broader transaction coverage and verified protocol labels.",
        "narration": (
            "tx402 is live, deployed over HTTPS, and has completed a real Mainnet settlement for 0.005 USDC. "
            "The next steps are expanding transaction coverage, adding more verified protocol labels, "
            "and packaging tx402 for wider agent marketplace distribution."
        ),
    },
]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
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


def draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fnt, fill, max_width: int, spacing: int) -> int:
    x, y = xy
    for line in wrap_text(draw, text, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + spacing
    return y


def make_slide(index: int, data: dict[str, object]) -> Path:
    img = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle((70, 70, WIDTH - 70, HEIGHT - 70), radius=34, fill=PANEL)
    draw.rectangle((70, 70, 115, HEIGHT - 70), fill=ACCENT)

    draw.text((150, 125), str(data["title"]), font=TITLE, fill=TEXT)
    y = draw_wrapped(draw, (150, 225), str(data["subtitle"]), SUBTITLE, MUTED, 1550, 10)

    y += 55
    for bullet in data["bullets"]:
        draw.ellipse((155, y + 11, 175, y + 31), fill=ACCENT)
        y = draw_wrapped(draw, (200, y), str(bullet), BODY, TEXT, 1500, 9)
        y += 28

    draw.rounded_rectangle((150, 820, WIDTH - 150, 940), radius=22, fill=CODE_BG, outline=ACCENT, width=2)
    draw_wrapped(draw, (190, 850), str(data["callout"]), BODY_BOLD, TEXT, 1500, 8)

    draw.text((150, 980), "tx402 - x402 payments on Algorand", font=SMALL, fill=MUTED)
    draw.text((WIDTH - 260, 980), f"{index + 1}/6", font=SMALL, fill=MUTED)

    path = SLIDES / f"slide-{index + 1:02d}.png"
    img.save(path)
    return path


def make_wav(index: int, text: str) -> Path:
    out = AUDIO / f"slide-{index + 1:02d}.wav"
    text_file = AUDIO / f"slide-{index + 1:02d}.txt"
    text_file.write_text(text, encoding="utf-8")

    ps = (
        "Add-Type -AssemblyName System.Speech; "
        "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
        "$speaker.SelectVoice('Microsoft Zira Desktop'); "
        "$speaker.Rate = -1; "
        f"$text = Get-Content -Raw -Encoding UTF8 '{text_file}'; "
        f"$speaker.SetOutputToWaveFile('{out}'); "
        "$speaker.Speak($text); "
        "$speaker.Dispose();"
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=True)
    return out


def run_ffmpeg(args: list[str]) -> None:
    subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", *args], check=True)


def make_segment(index: int, image: Path, audio: Path, duration: int) -> Path:
    segment = VIDEO / f"segment-{index + 1:02d}.mp4"
    run_ffmpeg(
        [
            "-y",
            "-loop",
            "1",
            "-i",
            str(image),
            "-i",
            str(audio),
            "-vf",
            "scale=1920:1080,format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-tune",
            "stillimage",
            "-c:a",
            "aac",
            "-af",
            "apad",
            "-b:a",
            "160k",
            "-t",
            str(duration),
            str(segment),
        ]
    )
    return segment


def main() -> None:
    if not FFMPEG.exists():
        raise SystemExit(f"ffmpeg binary not found: {FFMPEG}")

    for directory in [OUT, SLIDES, AUDIO, VIDEO]:
        directory.mkdir(parents=True, exist_ok=True)

    segments: list[Path] = []
    for index, slide in enumerate(slides):
        image = make_slide(index, slide)
        audio = make_wav(index, str(slide["narration"]))
        segments.append(make_segment(index, image, audio, int(slide["duration"])))

    concat = OUT / "concat.txt"
    concat.write_text(
        "\n".join(f"file '{segment.as_posix()}'" for segment in segments),
        encoding="utf-8",
    )

    run_ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(FINAL)])

    probe = subprocess.run(
        [
            str(FFMPEG),
            "-hide_banner",
            "-i",
            str(FINAL),
        ],
        stderr=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )

    metadata = {
        "video": str(FINAL),
        "slides": len(slides),
        "bytes": FINAL.stat().st_size,
        "ffmpeg_probe": "\n".join(probe.stderr.splitlines()[:12]),
    }
    (OUT / "video-metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
