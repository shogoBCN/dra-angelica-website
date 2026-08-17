"""
Audio sweetening for slideshow mux — skip intro, fade in/out.

Lyria-generated background tracks often open with a few somber bars before the
intended mood. ``build_slideshow.mux_audio`` seeks past ``AUDIO_SKIP_SECONDS``
so the slideshow's own visual fade-in covers the join. Fades avoid hard cuts at
start and end of the final MP4.

Filter chain is returned as an ffmpeg ``-af`` string from ``audio_filter()``.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

# Skip somber opening bars; slideshow scene-1 fade-in covers the join.
AUDIO_SKIP_SECONDS = 2.0
AUDIO_FADE_IN_SECONDS = 1.5
AUDIO_FADE_OUT_SECONDS = 2.0


def audio_filter(duration: float) -> str:
    """
    ffmpeg audio filter: fade in at t=0, fade out before *duration* ends.

    Parameters
    ----------
    duration:
        Total muxed video length in seconds (from ``build_slideshow``).
    """
    fade_out_start = max(0.0, duration - AUDIO_FADE_OUT_SECONDS)
    return (
        f"afade=t=in:st=0:d={AUDIO_FADE_IN_SECONDS:.3f},"
        f"afade=t=out:st={fade_out_start:.3f}:d={AUDIO_FADE_OUT_SECONDS:.3f}"
    )


def atempo_chain(speed: float) -> str:
    """Pitch-preserving speed change; ``atempo`` only accepts 0.5–2.0 per stage."""
    if abs(speed - 1.0) < 0.008:
        return "anull"
    stages: list[str] = []
    remaining = speed
    while remaining > 2.0 + 1e-6:
        stages.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5 - 1e-6:
        stages.append("atempo=0.5")
        remaining /= 0.5
    stages.append(f"atempo={remaining:.5f}")
    return ",".join(stages)


def _trim_speed_filter(
    input_label: str,
    start: float,
    src_dur: float,
    dst_dur: float,
    out_label: str,
) -> str:
    speed = src_dur / max(dst_dur, 0.05)
    return (
        f"{input_label}atrim=start={start:.3f}:duration={src_dur:.3f},"
        f"asetpts=PTS-STARTPTS,{atempo_chain(speed)}[{out_label}]"
    )


def fit_score_to_turn(
    source: Path,
    dest: Path,
    *,
    src_skip: float,
    src_hopeful: float,
    src_finale: float,
    src_end: float,
    dst_hopeful: float,
    dst_finale: float,
    dst_end: float,
    fade: float,
    skip_hopeful_segment: bool = False,
) -> None:
    """
    Time-stretch the Google 8-scene score so the sad→hopeful→finale turns
    land on the Facebook cut (Angélica / golden-hour CTA).

    Source timestamps are *video* seconds on the original 8-scene timeline.
    ``src_skip`` is the mux seek into the MP3 (``AUDIO_SKIP_SECONDS``).
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    sad_src = src_hopeful
    sad_dst = dst_hopeful + fade
    hope_src = src_finale - src_hopeful
    hope_dst = (dst_finale - dst_hopeful) + fade
    fin_src = src_end - src_finale
    fin_dst = dst_end - dst_finale

    sad_file = src_skip
    hope_file = src_skip + src_hopeful
    fin_file = src_skip + src_finale

    parts = [
        _trim_speed_filter("[0:a]", sad_file, sad_src, sad_dst, "sad"),
    ]
    if skip_hopeful_segment:
        parts.append(_trim_speed_filter("[0:a]", fin_file, fin_src, fin_dst, "fin"))
        parts.append(f"[sad][fin]acrossfade=d={fade:.3f}:c1=tri:c2=tri[outa]")
        print(
            f"  score: sad {sad_src:.1f}s→{sad_dst:.1f}s · "
            f"finale {fin_src:.1f}s→{fin_dst:.1f}s (skip hopeful bed)"
        )
    else:
        parts.append(_trim_speed_filter("[0:a]", hope_file, hope_src, hope_dst, "hope"))
        parts.append(_trim_speed_filter("[0:a]", fin_file, fin_src, fin_dst, "fin"))
        parts.append(f"[sad][hope]acrossfade=d={fade:.3f}:c1=tri:c2=tri[sh]")
        parts.append(f"[sh][fin]acrossfade=d={fade:.3f}:c1=tri:c2=tri[outa]")
        print(
            f"  score: sad {sad_src:.1f}s→{sad_dst:.1f}s · "
            f"hopeful {hope_src:.1f}s→{hope_dst:.1f}s @ {dst_hopeful:.1f}s · "
            f"finale {fin_src:.1f}s→{fin_dst:.1f}s @ {dst_finale:.1f}s"
        )

    filter_complex = ";".join(parts)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-filter_complex",
        filter_complex,
        "-map",
        "[outa]",
        "-c:a",
        "libmp3lame",
        "-q:a",
        "2",
        str(dest),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg score fit failed:\n{proc.stderr.strip()}")
