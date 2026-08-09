#!/usr/bin/env python3
"""
Animate scene stills into short clips via Gemini Veo (image-to-video).

Uses ``google-genai`` SDK. Scene motion prompts in ``SCENE_MOTION``; transitions
between scenes use ``TRANSITION_PROMPTS``. Square 1:1 sources are letterboxed to
9:16 before Veo because native 1:1 output is not supported.

Outputs ``scene_<N>.mp4`` under campaign aspect folders. Used by
``build_ad_preview.py`` for paced previews with optional Veo transitions.

Usage::

    python generate_video.py 1 --aspect 1:1
"""

from __future__ import annotations

import argparse
import io
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from google import genai
from google.genai import types
from PIL import Image

from lib.paths import DEFAULT_CAMPAIGN, REPO_ROOT
from lib.gemini import load_env

ROOT = REPO_ROOT
VIDEO = DEFAULT_CAMPAIGN

# ---------------------------------------------------------------------------
# Motion prompts — subtle camera drift; preserve on-image Spanish copy and
# grayscale look (scene 8 is full-color CTA).
# ---------------------------------------------------------------------------
SCENE_MOTION: dict[int, str] = {
    1: (
        "Cinematic grayscale photorealistic kitchen scene. The stressed woman breathes "
        "slowly with subtle natural movement, fingers lightly on her temples, eyes closed. "
        "Pill bottles and three appointment cards on the table stay still. Very slow "
        "camera dolly-in. Keep all Spanish on-screen text perfectly sharp and unchanged."
    ),
    2: (
        "Cinematic grayscale cardiologist office. The doctor gestures calmly with both "
        "hands while speaking; patient seen from behind remains still. Heart model and "
        "clipboard on desk. Slow subtle camera push. Preserve all wall text and poster "
        "exactly as in the source image."
    ),
    3: (
        "Cinematic grayscale endocrinology office. The doctor holds a glucometer with "
        "subtle hand movement while explaining; patient from behind stays still. Glucose "
        "chart on wall unchanged. Slow gentle camera movement. Keep all on-screen Spanish "
        "text sharp and unchanged."
    ),
    4: (
        "Cinematic grayscale rheumatology office. The doctor writes slowly on the clipboard "
        "with subtle pen movement; knee joint model and X-ray lightbox stay still. Patient "
        "from behind remains still. Slow camera push. Preserve all on-screen text exactly."
    ),
    5: (
        "Cinematic grayscale hospital hallway. The worried patient looks up slowly with "
        "subtle breathing; folders and pill bottle in her arms move slightly. Question "
        "marks above head drift gently. Slow dolly down the corridor. Keep all Spanish "
        "text and door signs sharp and unchanged."
    ),
}

NEGATIVE_PROMPT = (
    "color, saturation, new text, changed text, misspelled text, banners, split screen, "
    "morphing faces, distorted anatomy, fast motion, shaky camera, scene cuts, flicker"
)

TRANSITION_PROMPTS: dict[tuple[int, int], str] = {
    (1, 2): (
        "Cinematic grayscale photorealistic transition. The overwhelmed woman in her "
        "kitchen with pill bottles and appointment cards smoothly dissolves into a "
        "cardiologist office. A doctor gestures while explaining to a patient seen "
        "from behind; heart model on desk. Slow dreamy morph, one continuous shot, "
        "no hard cuts, no color. Medical ad style."
    ),
}


def image_part(path: Path) -> types.Image:
    """Wrap a local PNG/JPEG as a ``google.genai`` Image for Veo input."""
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return types.Image(image_bytes=path.read_bytes(), mime_type=mime)


def pad_image_to_aspect(path: Path, aspect_ratio: str) -> bytes:
    """Letterbox/pillarbox so square sources survive 9:16 Veo output."""
    w_ratio, h_ratio = (int(x) for x in aspect_ratio.split(":"))
    target = w_ratio / h_ratio
    im = Image.open(path).convert("RGB")
    w, h = im.size
    current = w / h
    if current > target:
        canvas_w, canvas_h = w, int(round(w / target))
    else:
        canvas_w, canvas_h = int(round(h * target)), h
    canvas = Image.new("RGB", (canvas_w, canvas_h), (0, 0, 0))
    canvas.paste(im, ((canvas_w - w) // 2, (canvas_h - h) // 2))
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def crop_video_to_square(src: Path, dst: Path) -> None:
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            str(src),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    width, height = (int(x) for x in probe.stdout.strip().split("x"))
    side = min(width, height)
    x_off = (width - side) // 2
    y_off = (height - side) // 2
    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(src),
            "-vf",
            f"crop={side}:{side}:{x_off}:{y_off}",
            "-an",
            str(dst),
        ],
        check=True,
    )


def wait_for_video(client: genai.Client, operation: types.GenerateVideosOperation) -> types.GenerateVideosOperation:
    """Poll Veo long-running operation every 15s until done or error."""
    poll_seconds = 15
    while not operation.done:
        print(f"  waiting… ({poll_seconds}s)")
        time.sleep(poll_seconds)
        operation = client.operations.get(operation)
        if getattr(operation, "error", None):
            raise SystemExit(f"Veo operation failed: {operation.error}")
    return operation


def save_generated_video(
    client: genai.Client,
    generated: types.GeneratedVideo,
    out_path: Path,
    *,
    output_square: bool,
) -> None:
    video = generated.video
    if video is None:
        raise SystemExit("Veo returned a generated clip without video data")
    assert video is not None  # for type checkers that don't treat SystemExit as NoReturn

    client.files.download(file=video)

    with tempfile.TemporaryDirectory(prefix="veo_") as tmp_dir:
        raw = Path(tmp_dir) / "raw.mp4"
        video.save(str(raw))
        if output_square:
            crop_video_to_square(raw, out_path)
        else:
            out_path.write_bytes(raw.read_bytes())


def generate_transition(
    *,
    client: genai.Client,
    model: str,
    first_path: Path,
    last_path: Path,
    prompt: str,
    veo_aspect: str,
    output_square: bool,
    resolution: str,
    duration_seconds: int,
    out_path: Path,
) -> None:
    """
    Veo first→last frame morph (used by ``build_ad_preview``).

    Square 1:1 stills are letterboxed to ``veo_aspect`` before upload, then
    center-cropped back to square on save when ``output_square`` is True.
    """
    if output_square:
        first_bytes = pad_image_to_aspect(first_path, veo_aspect)
        last_bytes = pad_image_to_aspect(last_path, veo_aspect)
        first = types.Image(image_bytes=first_bytes, mime_type="image/png")
        last = types.Image(image_bytes=last_bytes, mime_type="image/png")
    else:
        first = image_part(first_path)
        last = image_part(last_path)

    operation = client.models.generate_videos(
        model=model,
        prompt=prompt,
        image=first,
        config=types.GenerateVideosConfig(
            aspect_ratio=veo_aspect,
            resolution=resolution,
            duration_seconds=duration_seconds,
            last_frame=last,
            negative_prompt=NEGATIVE_PROMPT,
            person_generation="allow_adult",
        ),
    )

    operation = wait_for_video(client, operation)
    result = operation.result
    if not result or not result.generated_videos:
        raise SystemExit(f"No transition video for {first_path.name}→{last_path.name}")

    generated = result.generated_videos[0]
    save_generated_video(
        client, generated, out_path, output_square=output_square
    )


def generate_clip(
    *,
    client: genai.Client,
    model: str,
    image_path: Path,
    prompt: str,
    veo_aspect: str,
    output_square: bool,
    resolution: str,
    duration_seconds: int,
    out_path: Path,
) -> None:
    """Single-image Veo clip (image-to-video, no last-frame morph)."""
    if output_square:
        image_bytes = pad_image_to_aspect(image_path, veo_aspect)
        image = types.Image(image_bytes=image_bytes, mime_type="image/png")
    else:
        image = image_part(image_path)

    operation = client.models.generate_videos(
        model=model,
        source=types.GenerateVideosSource(image=image, prompt=prompt),
        config=types.GenerateVideosConfig(
            aspect_ratio=veo_aspect,
            resolution=resolution,
            duration_seconds=duration_seconds,
            negative_prompt=NEGATIVE_PROMPT,
            person_generation="allow_adult",
        ),
    )

    operation = wait_for_video(client, operation)
    result = operation.result
    if not result or not result.generated_videos:
        raise SystemExit(f"No video returned for {image_path.name}")

    generated = result.generated_videos[0]
    save_generated_video(
        client, generated, out_path, output_square=output_square
    )


def scene_numbers(folder: Path, only: int | None) -> list[int]:
    if only is not None:
        return [only]
    nums: list[int] = []
    for path in sorted(folder.glob("scene_*.png")):
        nums.append(int(path.stem.split("_")[1]))
    if not nums:
        raise SystemExit(f"No scene_*.png in {folder}")
    return [n for n in nums if n in SCENE_MOTION]


def main() -> None:
    parser = argparse.ArgumentParser(description="Animate scene PNGs with Veo image-to-video")
    parser.add_argument(
        "folder",
        nargs="?",
        default=str(VIDEO / "1x1"),
        help="Folder with scene_*.png (default: 1x1)",
    )
    parser.add_argument("--scene", type=int, default=None, help="Only this scene number")
    parser.add_argument(
        "--transition",
        nargs=2,
        type=int,
        metavar=("FROM", "TO"),
        help="Generate first→last frame transition between two scenes",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Veo model (default: GEMINI_VIDEO_MODEL or veo-3.1-fast-generate-preview)",
    )
    parser.add_argument(
        "--aspect",
        default="1:1",
        help="Desired output aspect (default: 1:1; Veo renders 9:16 then center-crops)",
    )
    parser.add_argument(
        "--resolution",
        default="720p",
        choices=["720p", "1080p"],
        help="Output resolution (default: 720p)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=4,
        choices=[4, 6, 8],
        help="Clip length in seconds (default: 4)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip paid-feature confirmation",
    )
    args = parser.parse_args()

    if not args.yes:
        print(
            "Veo is a paid API feature. Re-run with --yes to confirm billing.",
            file=sys.stderr,
        )
        raise SystemExit(2)

    load_env()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set")

    model = args.model or os.environ.get(
        "GEMINI_VIDEO_MODEL", "veo-3.1-fast-generate-preview"
    )
    folder = Path(args.folder).resolve()
    client = genai.Client(api_key=api_key)

    output_square = args.aspect == "1:1"
    veo_aspect = "9:16" if output_square else args.aspect

    if args.transition:
        from_scene, to_scene = args.transition
        first = folder / f"scene_{from_scene}.png"
        last = folder / f"scene_{to_scene}.png"
        for path in (first, last):
            if not path.exists():
                raise SystemExit(f"Missing {path}")
        pair = (from_scene, to_scene)
        prompt = TRANSITION_PROMPTS.get(pair)
        if not prompt:
            raise SystemExit(f"No transition prompt for {from_scene}→{to_scene}")
        out = folder / "preview" / f"transition_{from_scene}_{to_scene}.mp4"
        out.parent.mkdir(parents=True, exist_ok=True)
        print(f"Transition {from_scene}→{to_scene} → {out.name}")
        print(f"  model: {model} · {args.duration}s")
        generate_transition(
            client=client,
            model=model,
            first_path=first,
            last_path=last,
            prompt=prompt,
            veo_aspect=veo_aspect,
            output_square=output_square,
            resolution=args.resolution,
            duration_seconds=args.duration,
            out_path=out,
        )
        print(f"  saved {out.stat().st_size // 1024:,} KB")
        print("Done.")
        return

    for scene in scene_numbers(folder, args.scene):
        image_path = folder / f"scene_{scene}.png"
        if not image_path.exists():
            raise SystemExit(f"Missing {image_path}")
        prompt = SCENE_MOTION.get(scene)
        if not prompt:
            raise SystemExit(f"No motion prompt for scene {scene}")

        out = image_path.with_suffix(".mp4")
        print(f"Scene {scene} → {out.name}")
        print(f"  model: {model}")
        if output_square:
            print(
                f"  veo: {veo_aspect} padded → crop {args.aspect} · "
                f"{args.resolution} · {args.duration}s"
            )
        else:
            print(f"  aspect: {veo_aspect} · {args.resolution} · {args.duration}s")

        generate_clip(
            client=client,
            model=model,
            image_path=image_path,
            prompt=prompt,
            veo_aspect=veo_aspect,
            output_square=output_square,
            resolution=args.resolution,
            duration_seconds=args.duration,
            out_path=out,
        )

        size_kb = out.stat().st_size // 1024
        print(f"  saved {size_kb:,} KB")

    print("Done.")


if __name__ == "__main__":
    main()
