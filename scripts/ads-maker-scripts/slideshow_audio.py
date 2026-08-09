"""
Audio sweetening for slideshow mux — skip intro, fade in/out.

Lyria-generated background tracks often open with a few somber bars before the
intended mood. ``build_slideshow.mux_audio`` seeks past ``AUDIO_SKIP_SECONDS``
so the slideshow's own visual fade-in covers the join. Fades avoid hard cuts at
start and end of the final MP4.

Filter chain is returned as an ffmpeg ``-af`` string from ``audio_filter()``.
"""

from __future__ import annotations

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
