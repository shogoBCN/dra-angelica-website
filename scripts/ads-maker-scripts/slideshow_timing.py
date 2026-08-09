"""Shared slideshow scene durations and derived playback timing."""

from __future__ import annotations

DEFAULT_DURATIONS: dict[int, float] = {
    1: 5.0,
    2: 3.5,
    3: 3.5,
    4: 3.5,
    5: 5.0,
    6: 5.5,
    7: 6.5,
    8: 6.0,
}

FADE_SECONDS = 0.4
SCENE_COUNT = len(DEFAULT_DURATIONS)


def hold_seconds() -> float:
    """Sum of per-scene holds (before crossfade overlap)."""
    return sum(DEFAULT_DURATIONS.values())


def playback_seconds() -> float:
    """Final video length with crossfades between scenes."""
    return hold_seconds() - FADE_SECONDS * (SCENE_COUNT - 1)


def scene_start_second(scene: int) -> float:
    """When scene N (1-based) begins fading in on the final timeline."""
    if scene < 1 or scene > SCENE_COUNT:
        raise ValueError(f"scene must be 1–{SCENE_COUNT}, got {scene}")
    if scene == 1:
        return 0.0
    timeline = DEFAULT_DURATIONS[1]
    for n in range(2, scene):
        timeline += DEFAULT_DURATIONS[n] - FADE_SECONDS
    return timeline - FADE_SECONDS


def music_target_seconds(*, buffer: float = 3.0) -> int:
    """Lyria track length: cover all holds + tail room (seconds, rounded up)."""
    return int(hold_seconds() + buffer + 0.999)


def format_timestamp(seconds: float) -> str:
    whole = int(seconds)
    return f"0:{whole:02d}"
