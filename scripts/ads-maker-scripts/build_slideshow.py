#!/usr/bin/env python3
"""Build a crossfade slideshow MP4 from scene PNGs."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VIDEO = Path(__file__).resolve().parent
AUDIO_DEFAULT = VIDEO / "audio" / "slideshow_background.mp3"

from slideshow_timing import DEFAULT_DURATIONS, FADE_SECONDS, playback_seconds
from slideshow_audio import (
    AUDIO_FADE_IN_SECONDS,
    AUDIO_FADE_OUT_SECONDS,
    AUDIO_SKIP_SECONDS,
    audio_filter,
)
from video_motion import ken_burns_vf

FPS = 30

# width, height per aspect folder name
ASPECT_SIZES: dict[str, tuple[int, int]] = {
    "1x1": (2048, 2048),
    "9x16": (1152, 2048),
    "16x9": (2048, 1152),
}


def scene_paths(folder: Path) -> list[Path]:
    paths = sorted(folder.glob("scene_*.png"), key=lambda p: int(p.stem.split("_")[1]))
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


def output_size(folder: Path) -> tuple[int, int]:
    name = folder.name
    if name in ASPECT_SIZES:
        return ASPECT_SIZES[name]
    # square fallback for custom folders
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


def mux_audio(video: Path, audio: Path, output: Path, *, duration: float) -> None:
    run_ffmpeg(
        [
            "-y",
            "-i",
            str(video),
            "-ss",
            f"{AUDIO_SKIP_SECONDS:.3f}",
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
) -> float:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg not found on PATH")

    paths = scene_paths(folder)
    durations = durations_for(paths, durations_override)
    total = sum(durations) - FADE_SECONDS * (len(paths) - 1)
    width, height = output_size(folder)

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
                f"(skip {AUDIO_SKIP_SECONDS:.1f}s, "
                f"fade in {AUDIO_FADE_IN_SECONDS:.1f}s, "
                f"fade out {AUDIO_FADE_OUT_SECONDS:.1f}s)"
            )
            mux_audio(silent, audio, output, duration=total)
        else:
            if audio:
                print(f"  warning: audio not found ({audio}), saving silent video")
            shutil.copy2(silent, output)

    return total


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
    args = parser.parse_args()

    audio = None if args.no_audio else args.audio.resolve()

    folders: list[Path]
    if args.folder:
        folders = [Path(args.folder).resolve()]
    else:
        folders = [VIDEO / name for name in ("1x1", "9x16", "16x9")]

    for folder in folders:
        if args.output and len(folders) > 1:
            raise SystemExit("Use --output only when building a single folder")
        output = (
            Path(args.output).resolve()
            if args.output
            else folder / "slideshow.mp4"
        )
        print(f"Building slideshow from {folder}")
        duration = build_slideshow(folder, output, audio=audio)
        size_kb = output.stat().st_size // 1024
        print(
            f"Saved {output} ({size_kb:,} KB, {duration:.1f}s, "
            f"expected ~{playback_seconds():.1f}s)\n"
        )


if __name__ == "__main__":
    main()
