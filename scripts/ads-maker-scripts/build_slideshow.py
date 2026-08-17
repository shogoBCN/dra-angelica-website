#!/usr/bin/env python3
"""
Build crossfade slideshow MP4s from scene PNGs (ffmpeg).

Reads ``scene_1.png`` … ``scene_8.png`` from each aspect folder under the
campaign video directory, applies Ken Burns motion + crossfades, muxes background
music from ``audio/slideshow_background.mp3``.

Default (no args): builds ``slideshow.mp4`` in the Google campaign
``ads/GoogleAds/08-aug-26/video/{1x1,9x16,16x9}``.

Usage::

    python build_slideshow.py
    python build_slideshow.py /path/to/1x1 -o /path/to/out.mp4 --no-audio
    python build_slideshow.py --config ../../ads/FacebookAds/16-aug-26/video/build.yaml

Timing: ``slideshow_timing.py`` (or per-build durations in YAML). Motion:
``video_motion.py``. Audio trim/fade: ``slideshow_audio.py``.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib.paths import DEFAULT_CAMPAIGN, resolve

VIDEO = DEFAULT_CAMPAIGN
AUDIO_DEFAULT = VIDEO / "audio" / "slideshow_background.mp3"

from slideshow_audio import (
    AUDIO_FADE_IN_SECONDS,
    AUDIO_FADE_OUT_SECONDS,
    AUDIO_SKIP_SECONDS,
    audio_filter,
    fit_score_to_turn,
)
from slideshow_timing import (
    DEFAULT_DURATIONS,
    FADE_SECONDS,
    GOOGLE_SCENE_ORDER,
    playback_length,
    playback_seconds,
    scene_start_on,
)
from video_motion import ken_burns_vf

FPS = 30

# width, height per aspect folder name
ASPECT_SIZES: dict[str, tuple[int, int]] = {
    "1x1": (2048, 2048),
    "4x5": (1638, 2048),
    "9x16": (1152, 2048),
    "16x9": (2048, 1152),
}


def scene_paths(folder: Path, scenes: list[int] | None = None) -> list[Path]:
    """``scene_*.png`` paths. If *scenes* is set, keep that order; else sort by number."""
    by_num: dict[int, Path] = {}
    for path in folder.glob("scene_*.png"):
        try:
            by_num[int(path.stem.split("_")[1])] = path
        except (IndexError, ValueError):
            continue
    if scenes:
        missing = [n for n in scenes if n not in by_num]
        if missing:
            raise SystemExit(f"Missing scene_{missing} in {folder}")
        return [by_num[n] for n in scenes]
    paths = [by_num[n] for n in sorted(by_num)]
    if not paths:
        raise SystemExit(f"No scene_*.png files in {folder}")
    return paths


def durations_for(paths: list[Path], overrides: dict[int, float] | None) -> list[float]:
    merged = {**DEFAULT_DURATIONS, **(overrides or {})}
    result: list[float] = []
    for path in paths:
        scene_num = int(path.stem.split("_")[1])
        if scene_num not in merged:
            raise SystemExit(f"No duration configured for scene {scene_num}")
        result.append(merged[scene_num])
    return result


def run_ffmpeg(args: list[str]) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", *args]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(
            f"ffmpeg failed ({proc.returncode}):\n{proc.stderr.strip()}"
        )


def output_size(folder: Path, sample: Path | None = None) -> tuple[int, int]:
    """Prefer the actual PNG pixel size so generated 2K masters are not rescaled."""
    if sample and sample.exists():
        try:
            from PIL import Image

            with Image.open(sample) as im:
                return im.size
        except OSError:
            pass
    name = folder.name
    if name in ASPECT_SIZES:
        return ASPECT_SIZES[name]
    return (2048, 2048)


def prepare_clip(src: Path, duration: float, dst: Path, *, width: int, height: int) -> None:
    frames = max(1, int(round(duration * FPS)))
    vf = ken_burns_vf(width, height, frames, fps=FPS)
    run_ffmpeg(
        [
            "-y",
            "-loop",
            "1",
            "-i",
            str(src),
            "-vf",
            vf,
            "-t",
            f"{duration:.3f}",
            "-an",
            str(dst),
        ]
    )


def xfade_clips(clips: list[Path], durations: list[float], dst: Path) -> None:
    if len(clips) == 1:
        shutil.copy2(clips[0], dst)
        return

    inputs: list[str] = []
    for clip in clips:
        inputs.extend(["-i", str(clip)])

    fade = FADE_SECONDS
    parts: list[str] = []
    last_label = "[0:v]"
    timeline = durations[0]

    for idx in range(1, len(clips)):
        out_label = f"[v{idx}]" if idx < len(clips) - 1 else "[vout]"
        offset = timeline - fade
        parts.append(
            f"{last_label}[{idx}:v]xfade=transition=fade:duration={fade}:offset={offset:.3f}{out_label}"
        )
        last_label = out_label
        timeline += durations[idx] - fade

    filter_complex = ";".join(parts)
    run_ffmpeg([*inputs, "-filter_complex", filter_complex, "-map", "[vout]", "-an", "-y", str(dst)])


def mux_audio(
    video: Path,
    audio: Path,
    output: Path,
    *,
    duration: float,
    skip: float = AUDIO_SKIP_SECONDS,
) -> None:
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(video),
            "-ss",
            f"{skip:.3f}",
            "-i",
            str(audio),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-af",
            audio_filter(duration),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            f"{duration:.3f}",
            str(output),
        ]
    )


def build_slideshow(
    folder: Path,
    output: Path,
    *,
    durations_override: dict[int, float] | None = None,
    audio: Path | None = None,
    scenes: list[int] | None = None,
    audio_skip: float = AUDIO_SKIP_SECONDS,
) -> float:
    """
    Render one aspect folder to MP4: Ken Burns clips → xfade → optional audio mux.

    Returns final duration in seconds (for sanity-check against ``playback_seconds()``).
    """
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg not found on PATH")

    paths = scene_paths(folder, scenes)
    durations = durations_for(paths, durations_override)
    total = sum(durations) - FADE_SECONDS * (len(paths) - 1)
    width, height = output_size(folder, paths[0])

    with tempfile.TemporaryDirectory(prefix="slideshow_") as tmp_dir:
        tmp = Path(tmp_dir)
        clips: list[Path] = []
        for path, duration in zip(paths, durations, strict=True):
            clip = tmp / f"{path.stem}.mp4"
            print(f"  clip {path.name}: {duration:.1f}s")
            prepare_clip(path, duration, clip, width=width, height=height)
            clips.append(clip)

        output.parent.mkdir(parents=True, exist_ok=True)
        print(f"  xfade {FADE_SECONDS:.1f}s between {len(clips)} clips")
        silent = tmp / "silent.mp4"
        xfade_clips(clips, durations, silent)

        if audio and audio.exists():
            print(
                f"  audio: {audio.name} "
                f"(skip {audio_skip:.1f}s, "
                f"fade in {AUDIO_FADE_IN_SECONDS:.1f}s, "
                f"fade out {AUDIO_FADE_OUT_SECONDS:.1f}s)"
            )
            mux_audio(silent, audio, output, duration=total, skip=audio_skip)
        else:
            if audio:
                print(f"  warning: audio not found ({audio}), saving silent video")
            shutil.copy2(silent, output)

    return total


def parse_durations(raw: str) -> dict[int, float]:
    """Parse ``1:3.2,5:2.8`` into ``{1: 3.2, 5: 2.8}``."""
    result: dict[int, float] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        key, _, value = part.partition(":")
        if not value:
            raise SystemExit(f"Bad --durations item (want scene:seconds): {part}")
        result[int(key)] = float(value)
    return result


def _print_saved(output: Path, duration: float, expected: float | None = None) -> None:
    size_kb = output.stat().st_size // 1024
    extra = f", expected ~{expected:.1f}s" if expected is not None else ""
    print(f"Saved {output} ({size_kb:,} KB, {duration:.1f}s{extra})\n")


def run_folder_build(
    folder: Path,
    output: Path,
    *,
    audio: Path | None,
    scenes: list[int] | None = None,
    durations_override: dict[int, float] | None = None,
    expected: float | None = None,
    audio_skip: float = AUDIO_SKIP_SECONDS,
) -> None:
    print(f"Building slideshow from {folder}")
    if scenes:
        print(f"  scenes: {scenes}")
    duration = build_slideshow(
        folder,
        output,
        audio=audio,
        scenes=scenes,
        durations_override=durations_override,
        audio_skip=audio_skip,
    )
    _print_saved(output, duration, expected)


def load_build_yaml(path: Path) -> None:
    """Run every build in a campaign ``build.yaml`` (Facebook short cuts, etc.)."""
    import yaml

    config_path = path if path.is_absolute() else path
    if not config_path.is_absolute():
        config_path = config_path.resolve() if config_path.exists() else resolve(path)
    if not config_path.exists():
        raise SystemExit(f"Build config not found: {config_path}")
    raw = yaml.safe_load(config_path.read_text()) or {}
    campaign = config_path.parent
    aspects = list(raw.get("aspects") or [])
    if not aspects:
        raise SystemExit(f"{config_path}: missing aspects")
    audio_raw = raw.get("audio")
    audio_source = (campaign / audio_raw).resolve() if audio_raw else None
    if audio_source and not audio_source.exists():
        print(f"  warning: audio not found ({audio_source})")
        audio_source = None

    src_hopeful = scene_start_on(GOOGLE_SCENE_ORDER, DEFAULT_DURATIONS, 7)
    src_finale = scene_start_on(GOOGLE_SCENE_ORDER, DEFAULT_DURATIONS, 8)
    src_end = playback_length(GOOGLE_SCENE_ORDER, DEFAULT_DURATIONS)
    align_music = bool(raw.get("align_music", False))

    for build in raw.get("builds") or []:
        name = build["name"]
        scenes = [int(n) for n in build["scenes"]]
        durations = {int(k): float(v) for k, v in (build.get("durations") or {}).items()}
        holds = sum(durations.get(n, 0.0) for n in scenes)
        expected = holds - FADE_SECONDS * (len(scenes) - 1) if holds else None
        audio = audio_source
        audio_skip = float(raw.get("audio_skip", AUDIO_SKIP_SECONDS))
        if align_music and audio_source and expected:
            music = build.get("music") or {}
            hopeful_scene = int(music.get("hopeful_scene", 7))
            finale_scene = int(music.get("finale_scene", 8))
            dst_hopeful = scene_start_on(scenes, durations, hopeful_scene)
            dst_finale = scene_start_on(scenes, durations, finale_scene)
            fitted = campaign / "audio" / f"fitted-{Path(name).stem}.mp3"
            print(f"\nFitting score for {name}")
            fit_score_to_turn(
                audio_source,
                fitted,
                src_skip=AUDIO_SKIP_SECONDS,
                src_hopeful=src_hopeful,
                src_finale=src_finale,
                src_end=src_end,
                dst_hopeful=dst_hopeful,
                dst_finale=dst_finale,
                dst_end=expected,
                fade=FADE_SECONDS,
                skip_hopeful_segment=hopeful_scene == finale_scene,
            )
            audio = fitted
            audio_skip = 0.0
        for aspect in aspects:
            folder = campaign / aspect
            output = folder / name
            run_folder_build(
                folder,
                output,
                audio=audio,
                scenes=scenes,
                durations_override=durations or None,
                expected=expected,
                audio_skip=audio_skip,
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build slideshow MP4 from scene PNGs")
    parser.add_argument(
        "folder",
        nargs="?",
        default=None,
        help="Folder with scene_*.png (default: all of 1x1, 9x16, 16x9)",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Output MP4 path (only with single folder)",
    )
    parser.add_argument(
        "--audio",
        type=Path,
        default=AUDIO_DEFAULT,
        help="Background music MP3 (default: audio/slideshow_background.mp3)",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Build silent video",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Campaign build.yaml (scenes, durations, aspects, output names)",
    )
    parser.add_argument(
        "--scenes",
        nargs="+",
        type=int,
        default=None,
        help="Scene numbers in playback order (e.g. 1 5 6 7 8)",
    )
    parser.add_argument(
        "--durations",
        default=None,
        help="Per-scene holds, e.g. 1:3.2,5:2.8,6:2.8,7:4.0,8:3.8",
    )
    parser.add_argument(
        "--name",
        default="slideshow.mp4",
        help="Filename inside each aspect folder (multi-folder builds)",
    )
    parser.add_argument(
        "--campaign",
        type=Path,
        default=None,
        help="Campaign video folder (used with --aspects)",
    )
    parser.add_argument(
        "--aspects",
        nargs="+",
        default=None,
        help="Aspect folder names under --campaign (e.g. 4x5 9x16)",
    )
    args = parser.parse_args()

    if args.config:
        load_build_yaml(args.config)
        return

    audio = None if args.no_audio else args.audio.resolve()
    durations_override = parse_durations(args.durations) if args.durations else None

    folders: list[Path]
    if args.campaign:
        campaign = resolve(args.campaign)
        aspect_names = args.aspects or ["4x5", "9x16"]
        folders = [campaign / name for name in aspect_names]
    elif args.folder:
        folders = [Path(args.folder).resolve()]
    else:
        folders = [DEFAULT_CAMPAIGN / name for name in ("1x1", "9x16", "16x9")]

    for folder in folders:
        if args.output and len(folders) > 1:
            raise SystemExit("Use --output only when building a single folder")
        output = (
            Path(args.output).resolve()
            if args.output
            else folder / args.name
        )
        expected = playback_seconds() if not args.scenes else None
        run_folder_build(
            folder,
            output,
            audio=audio,
            scenes=args.scenes,
            durations_override=durations_override,
            expected=expected,
        )


if __name__ == "__main__":
    main()
