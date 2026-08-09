#!/usr/bin/env python3
"""
Generate slideshow background music via Gemini Lyria API.

Produces ``ads/08-aug-26/video/audio/slideshow_background.mp3``. Lyria Pro often
returns ~60s regardless of prompt — this script trims to ``music_target_seconds()``
from ``slideshow_timing.py`` and applies a short fade-out.

Uses ``google-genai`` SDK (unlike image generation in ``lib/gemini.py`` which
uses raw REST). Shares ``load_env()`` from ``lib.gemini`` for ``.env.local``.

Usage::

    python generate_music.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib.paths import DEFAULT_CAMPAIGN, REPO_ROOT
from lib.gemini import load_env

ROOT = REPO_ROOT
VIDEO = DEFAULT_CAMPAIGN
AUDIO_DIR = VIDEO / "audio"

# Lyria model ids — Pro returns variable length; Flash is fixed ~30s
from slideshow_timing import (
    format_timestamp,
    hold_seconds,
    music_target_seconds,
    playback_seconds,
    scene_start_second,
)

CLIP_MODEL = "lyria-3-clip-preview"  # fixed 30s only
PRO_MODEL = "lyria-3-pro-preview"  # variable length — use for full slideshow


def trim_audio(audio_bytes: bytes, duration: float, *, fade_out: float = 1.5) -> bytes:
    """Lyria Pro often ignores prompt length — trim to slideshow duration."""
    fade_start = max(0.0, duration - fade_out)
    with tempfile.TemporaryDirectory(prefix="lyria_trim_") as tmp_dir:
        src = Path(tmp_dir) / "raw.mp3"
        dst = Path(tmp_dir) / "trimmed.mp3"
        src.write_bytes(audio_bytes)
        proc = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(src),
                "-t",
                f"{duration:.3f}",
                "-af",
                f"afade=t=out:st={fade_start:.3f}:d={fade_out:.3f}",
                str(dst),
            ],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise SystemExit(f"ffmpeg trim failed:\n{proc.stderr.strip()}")
        return dst.read_bytes()


def probe_duration(audio_bytes: bytes) -> float | None:
    with tempfile.TemporaryDirectory(prefix="lyria_probe_") as tmp_dir:
        src = Path(tmp_dir) / "probe.mp3"
        src.write_bytes(audio_bytes)
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(src),
            ],
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            return None
        try:
            return float(proc.stdout.strip())
        except ValueError:
            return None


def build_slideshow_prompt(*, duration: int, hopeful_at: float, finale_at: float) -> str:
    hopeful_ts = format_timestamp(hopeful_at)
    finale_ts = format_timestamp(finale_at)
    end_ts = format_timestamp(duration)
    return f"""EXACTLY {duration} seconds total — hard stop at {end_ts}, no extra bars or outro beyond that.
{duration}-second instrumental background for a Colombian family-medicine awareness video.
Instrumental only, no vocals, no lyrics, no singing. Do not exceed {duration} seconds.

[0:00 - {hopeful_ts}] Serious, contemplative, empathetic. Sparse solo piano, soft low strings,
minimal percussion. Slow tempo ~72 BPM. Dignified and emotional — patient overwhelmed
by fragmented specialist care. Subtle tension building, never scary or dramatic.

[{hopeful_ts} - {finale_ts}] Warm hopeful shift: brighter piano, gentle acoustic guitar, light strings.
Reassuring resolution — one doctor sees the whole picture. Tempo lifts slightly to ~80 BPM.
Calm optimism, trust, relief. Building gently toward something brighter.

[{finale_ts} - {end_ts}] Joyful golden-hour finale — the emotional payoff. Patient reunited with family,
life feels better. Brighter major-key piano, warm acoustic guitar, soft uplifting strings,
very light hand percussion (shaker or brushed snare). Tempo ~88–92 BPM, clearly happier
and sunnier than the rest of the track. Gentle smile in the melody; feel-good without
being cheesy or like a jingle. Sustain this warm positive energy through the final seconds;
only fade out in the last 1–2 seconds — do not drop back to somber before the end.

Style: cinematic documentary healthcare score. NOT corporate jingle, NOT epic trailer.
Clean, professional, trustworthy. Stereo, 44.1 kHz quality feel.
"""


def generate_via_rest(*, api_key: str, model: str, prompt: str) -> tuple[bytes, str | None]:
    base = os.environ.get(
        "GEMINI_API_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta",
    ).rstrip("/")
    url = f"{base}/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["AUDIO", "TEXT"]},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"API error {exc.code}: {detail}") from exc

    description: str | None = None
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            if part.get("text"):
                description = part["text"]
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.standard_b64decode(inline["data"]), description

    raise SystemExit(
        f"No audio in response:\n{json.dumps(payload, indent=2)[:2000]}"
    )


def _decode_inline_audio(data: bytes | str) -> bytes:
    if isinstance(data, str):
        return base64.standard_b64decode(data)
    return data


def _sdk_response_parts(response) -> list:
    parts = response.parts
    if parts is not None:
        return parts
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return []
    content = getattr(candidates[0], "content", None)
    if content is None:
        return []
    return getattr(content, "parts", None) or []


def generate_via_sdk(*, api_key: str, model: str, prompt: str) -> tuple[bytes, str | None]:
    from google import genai

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model=model, contents=prompt)
    description: str | None = None
    for part in _sdk_response_parts(response):
        if part.text:
            description = part.text
        elif part.inline_data and part.inline_data.data:
            return _decode_inline_audio(part.inline_data.data), description
    raise SystemExit("No audio in SDK response")


def generate(*, api_key: str, model: str, prompt: str) -> tuple[bytes, str | None]:
    try:
        return generate_via_sdk(api_key=api_key, model=model, prompt=prompt)
    except ImportError:
        return generate_via_rest(api_key=api_key, model=model, prompt=prompt)


def main() -> None:
    target = music_target_seconds()
    hopeful_at = scene_start_second(7)
    finale_at = scene_start_second(8)

    parser = argparse.ArgumentParser(description="Generate background music via Lyria")
    parser.add_argument(
        "--model",
        default=None,
        help=f"Lyria model (default: {PRO_MODEL} for slideshow length)",
    )
    parser.add_argument(
        "--clip",
        action="store_true",
        help=f"Use {CLIP_MODEL} (30s fixed — shorter than slideshow)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=target,
        help=f"Target track length in seconds (default: {target})",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=AUDIO_DIR / "slideshow_background.mp3",
        help="Output MP3 path",
    )
    parser.add_argument(
        "--no-trim",
        action="store_true",
        help="Keep raw Lyria length (Pro often ~60s regardless of prompt)",
    )
    parser.add_argument(
        "--prompt",
        default=None,
        help="Music generation prompt (default: auto from slideshow timing)",
    )
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set in .env.local")

    if args.clip:
        model = CLIP_MODEL
    elif args.model:
        model = args.model
    else:
        model = os.environ.get("GEMINI_MUSIC_MODEL", PRO_MODEL)

    if model == CLIP_MODEL and args.duration > 30:
        print(
            f"Warning: {CLIP_MODEL} is always 30s; slideshow holds are "
            f"{hold_seconds():.1f}s (~{playback_seconds():.1f}s with crossfades). "
            f"Use default {PRO_MODEL} or omit --clip.",
            file=sys.stderr,
        )

    prompt = args.prompt or build_slideshow_prompt(
        duration=args.duration,
        hopeful_at=hopeful_at,
        finale_at=finale_at,
    )

    print(f"Generating music → {args.output}")
    print(f"  model: {model}")
    print(
        f"  slideshow: {hold_seconds():.1f}s holds · "
        f"{playback_seconds():.1f}s playback · "
        f"hopeful ~{hopeful_at:.1f}s (scene 7) · "
        f"finale ~{finale_at:.1f}s (scene 8)"
    )
    print(f"  target track: {args.duration}s")

    audio_bytes, description = generate(api_key=api_key, model=model, prompt=prompt)
    raw_duration = probe_duration(audio_bytes)
    if raw_duration is not None:
        print(f"  raw from API: {raw_duration:.1f}s")

    if not args.no_trim and raw_duration and raw_duration > args.duration + 0.5:
        print(f"  trimming to {args.duration}s (Lyria length is unreliable)")
        audio_bytes = trim_audio(audio_bytes, args.duration)

    final_duration = probe_duration(audio_bytes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(audio_bytes)
    print(f"  saved {len(audio_bytes) // 1024} KB", end="")
    if final_duration is not None:
        print(f" · {final_duration:.1f}s")
    else:
        print()
    if description:
        print(f"  notes: {description[:300]}{'…' if len(description) > 300 else ''}")
    print("Done.")


if __name__ == "__main__":
    main()
