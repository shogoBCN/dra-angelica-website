#!/usr/bin/env python3
"""
Build a paced ad preview: fade-in text holds + optional Veo transitions.

Unlike ``build_slideshow.py`` (full 8-scene crossfade reel), this script stitches
a *short* preview from 2+ scene stills with elderly-friendly pacing:

1. Each scene: slow fade-in → hold so copy is readable → optional fade-out
2. Between scenes: Veo morph (default), dissolve, or black gap fallback

Veo transitions require billing confirmation (``--yes``). Consumer API often
fails on transitions — the script falls back to fade + black gap automatically.

Outputs
-------
``{folder}/preview/preview_{first}_{last}.mp4`` (720×720 square by default).

Usage::

    python build_ad_preview.py ads/08-aug-26/video/1x1 --scenes 1 2 --yes
    python build_ad_preview.py --skip-veo --transition-style dissolve
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_video import (
    TRANSITION_PROMPTS,
    generate_transition,
)
from lib.gemini import load_env
from lib.paths import DEFAULT_CAMPAIGN
from video_motion import FPS, ken_burns_vf

VIDEO = DEFAULT_CAMPAIGN

# ---------------------------------------------------------------------------
# Elderly-friendly pacing — longer than slideshow holds so on-image copy is
# readable before any transition starts.
# ---------------------------------------------------------------------------
TEXT_FADE_IN = 1.2
SCENE_READ_HOLD: dict[int, float] = {
    1: 6.5,  # three lines of Spanish headline
    2: 5.0,  # two lines
}
TRANSITION_DURATION = 6  # Veo max for consumer tier
OUTPUT_SIZE = 720  # square preview (letterboxed from 1:1 stills)


def run_ffmpeg(args: list[str]) -> None:
    """Run ffmpeg; raise ``SystemExit`` with stderr on non-zero exit."""
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *args],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg failed:\n{proc.stderr.strip()}")


FADE_OUT_BETWEEN = 0.8
BLACK_GAP = 0.35


def build_dissolve_transition(
    from_clip: Path,
    to_image: Path,
    out_path: Path,
    *,
    duration: float = 2.0,
) -> float:
    """Cross-dissolve from end of a clip into the next scene still."""
    frames = max(1, int(round(duration * FPS)))
    run_ffmpeg(
        [
            "-y",
            "-sseof",
            f"-{duration + 0.5:.3f}",
            "-i",
            str(from_clip),
            "-loop",
            "1",
            "-i",
            str(to_image),
            "-filter_complex",
            (
                f"[0:v]scale={OUTPUT_SIZE}:{OUTPUT_SIZE}:force_original_aspect_ratio=decrease,"
                f"pad={OUTPUT_SIZE}:{OUTPUT_SIZE}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
                f"trim=duration={duration + 0.5:.3f},setpts=PTS-STARTPTS,fps={FPS}[a];"
                f"[1:v]scale={OUTPUT_SIZE}:{OUTPUT_SIZE}:force_original_aspect_ratio=decrease,"
                f"pad={OUTPUT_SIZE}:{OUTPUT_SIZE}:(ow-iw)/2:(oh-ih)/2,setsar=1,"
                f"fps={FPS},trim=duration={duration:.3f},setpts=PTS-STARTPTS[b];"
                f"[a][b]xfade=transition=fade:duration={duration:.3f}:offset=0.5,format=yuv420p[v]"
            ),
            "-map",
            "[v]",
            "-t",
            f"{duration:.3f}",
            "-an",
            str(out_path),
        ]
    )
    return duration


def build_hold_clip(
    image_path: Path,
    out_path: Path,
    *,
    fade_in: float,
    hold_after_fade: float,
    fade_out: float = 0.0,
) -> float:
    """Still + subtle zoom; fades in (and optionally out) so copy stays readable."""
    total = fade_in + hold_after_fade + fade_out
    frames = max(1, int(round(total * FPS)))
    fade_in = min(fade_in, total - 0.1)
    fade_filters = f"fade=t=in:st=0:d={fade_in:.3f}"
    if fade_out > 0:
        fade_start = fade_in + hold_after_fade
        fade_filters += f",fade=t=out:st={fade_start:.3f}:d={fade_out:.3f}"
    vf = ken_burns_vf(
        OUTPUT_SIZE,
        OUTPUT_SIZE,
        frames,
        fps=FPS,
        zoom_amount=0.015,
        suffix=fade_filters,
    )
    run_ffmpeg(
        [
            "-y",
            "-loop",
            "1",
            "-i",
            str(image_path),
            "-vf",
            vf,
            "-t",
            f"{total:.3f}",
            "-an",
            str(out_path),
        ]
    )
    return total


def concat_clips(clips: list[Path], out_path: Path) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as handle:
        list_path = Path(handle.name)
        for clip in clips:
            handle.write(f"file '{clip.resolve()}'\n")
    try:
        run_ffmpeg(
            [
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(list_path),
                "-c",
                "copy",
                str(out_path),
            ]
        )
    finally:
        list_path.unlink(missing_ok=True)


def build_black_gap(out_path: Path, duration: float = BLACK_GAP) -> None:
    run_ffmpeg(
        [
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=black:s={OUTPUT_SIZE}x{OUTPUT_SIZE}:r={FPS}",
            "-t",
            f"{duration:.3f}",
            "-an",
            str(out_path),
        ]
    )


def build_preview(
    folder: Path,
    scenes: list[int],
    *,
    model: str,
    resolution: str,
    transition_style: str,
    skip_veo: bool,
    transition_path: Path | None,
) -> Path:
    """
    Assemble hold clips + transition into one preview MP4.

    Transition priority: explicit ``transition_path`` → Veo (if allowed) →
    dissolve or black gap depending on ``transition_style``.
    """
    if len(scenes) < 2:
        raise SystemExit("Need at least two scene numbers")

    out_dir = folder / "preview"
    out_dir.mkdir(parents=True, exist_ok=True)
    segments: list[Path] = []

    for index, scene in enumerate(scenes):
        image = folder / f"scene_{scene}.png"
        if not image.exists():
            raise SystemExit(f"Missing {image}")
        hold = out_dir / f"scene_{scene}_hold.mp4"
        hold_seconds = SCENE_READ_HOLD.get(scene, 5.0)
        fade_out = FADE_OUT_BETWEEN if index < len(scenes) - 1 else 0.0
        print(
            f"Scene {scene}: {TEXT_FADE_IN:.1f}s fade in + "
            f"{hold_seconds:.1f}s read"
            + (f" + {fade_out:.1f}s fade out" if fade_out else "")
        )
        build_hold_clip(
            image,
            hold,
            fade_in=TEXT_FADE_IN,
            hold_after_fade=hold_seconds,
            fade_out=fade_out,
        )
        segments.append(hold)

    pair = (scenes[0], scenes[1])
    transition_out = out_dir / f"transition_{pair[0]}_{pair[1]}.mp4"
    final_segments: list[Path] = []

    if transition_path and transition_path.exists():
        print(f"Using existing transition: {transition_path.name}")
        final_segments = [segments[0], transition_path, *segments[1:]]
    elif transition_style == "veo" and not skip_veo:
        from google import genai
        import os

        load_env()
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise SystemExit("GEMINI_API_KEY not set")
        client = genai.Client(api_key=api_key)
        prompt = TRANSITION_PROMPTS.get(pair)
        if not prompt:
            raise SystemExit(f"No transition prompt for scenes {pair[0]}→{pair[1]}")

        first = folder / f"scene_{pair[0]}.png"
        last = folder / f"scene_{pair[1]}.png"
        print(f"Veo transition {pair[0]}→{pair[1]} ({TRANSITION_DURATION}s)")
        try:
            generate_transition(
                client=client,
                model=model,
                first_path=first,
                last_path=last,
                prompt=prompt,
                veo_aspect="9:16",
                output_square=True,
                resolution=resolution,
                duration_seconds=TRANSITION_DURATION,
                out_path=transition_out,
            )
            final_segments = [segments[0], transition_out, *segments[1:]]
        except Exception as exc:
            print(f"  Veo unavailable ({exc}). Using fade + black gap.")
            transition_style = "fade"

    if not final_segments:
        if transition_style == "dissolve":
            print(f"Dissolve transition {pair[0]}→{pair[1]} (2.0s)")
            build_dissolve_transition(
                segments[0], folder / f"scene_{pair[1]}.png", transition_out
            )
            # Scene 2 hold already fades in; trim duplicate fade by using shorter fade on s2
            final_segments = [segments[0], transition_out]
            # Append scene 2 from after dissolve without re-fade: rebuild scene 2 without fade-in
            scene2_hold = out_dir / "scene_2_tail.mp4"
            build_hold_clip(
                folder / "scene_2.png",
                scene2_hold,
                fade_in=0.0,
                hold_after_fade=SCENE_READ_HOLD.get(2, 5.0),
            )
            final_segments.append(scene2_hold)
        else:
            gap = out_dir / "black_gap.mp4"
            build_black_gap(gap)
            final_segments = [segments[0], gap, segments[1]]

    output = out_dir / f"preview_{scenes[0]}_{scenes[-1]}.mp4"
    print(f"Concatenating {len(final_segments)} segments → {output.name}")
    concat_clips(final_segments, output)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Build paced ad preview with Veo transitions")
    parser.add_argument(
        "folder",
        nargs="?",
        default=str(VIDEO / "1x1"),
        help="Folder with scene_*.png",
    )
    parser.add_argument(
        "--scenes",
        nargs="+",
        type=int,
        default=[1, 2],
        help="Scene numbers in order (default: 1 2)",
    )
    parser.add_argument("--model", default=None)
    parser.add_argument("--resolution", default="720p", choices=["720p", "1080p"])
    parser.add_argument(
        "--transition-style",
        choices=["veo", "fade", "dissolve"],
        default="veo",
        help="Between-scene transition (default: veo, falls back to fade)",
    )
    parser.add_argument(
        "--skip-veo",
        action="store_true",
        help="Do not call Veo API",
    )
    parser.add_argument(
        "--transition-file",
        type=Path,
        default=None,
        help="Use this transition mp4 instead of generating",
    )
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    if args.transition_style == "veo" and not args.skip_veo and not args.yes:
        print("Veo is paid. Re-run with --yes to confirm billing.", file=sys.stderr)
        raise SystemExit(2)

    import os

    load_env()
    model = args.model or os.environ.get(
        "GEMINI_VIDEO_MODEL", "veo-3.1-fast-generate-preview"
    )

    output = build_preview(
        Path(args.folder).resolve(),
        args.scenes,
        model=model,
        resolution=args.resolution,
        transition_style=args.transition_style,
        skip_veo=args.skip_veo,
        transition_path=args.transition_file,
    )
    print(f"Done → {output}")


if __name__ == "__main__":
    main()
