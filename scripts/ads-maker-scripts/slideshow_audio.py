"""Slideshow audio sweetening — skip intro, fade in/out."""

from __future__ import annotations

# Skip somber opening bars; slideshow fade-in covers the join.
AUDIO_SKIP_SECONDS = 2.0
AUDIO_FADE_IN_SECONDS = 1.5
AUDIO_FADE_OUT_SECONDS = 2.0


def audio_filter(duration: float) -> str:
    fade_out_start = max(0.0, duration - AUDIO_FADE_OUT_SECONDS)
    return (
        f"afade=t=in:st=0:d={AUDIO_FADE_IN_SECONDS:.3f},"
        f"afade=t=out:st={fade_out_start:.3f}:d={AUDIO_FADE_OUT_SECONDS:.3f}"
    )
