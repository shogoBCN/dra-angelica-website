"""
Shared scene durations and derived playback timing for the Aug-26 slideshow.

The 8-scene narrative runs ~35.7s with 0.4s crossfades between holds.
``generate_music.py`` uses ``music_target_seconds()`` to request a Lyria track
long enough for all holds plus a tail buffer; ``build_slideshow.py`` uses the
same numbers for ffmpeg ``xfade`` offsets.

Timeline model
--------------
Each scene has a *hold* duration (how long the still is visible). Adjacent scenes
overlap by ``FADE_SECONDS`` during crossfade, so total playback is::

    sum(holds) - FADE_SECONDS * (SCENE_COUNT - 1)

``scene_start_second(n)`` returns when scene *n* begins fading in on the final
muxed timeline — useful for music prompt timestamps (hopeful shift at scene 7).
"""

from __future__ import annotations

# Per-scene hold seconds (before crossfade overlap). Scene 3 is absent in the
# slideshow (jumps 2→4 in the storyboard numbering) — only configured scenes
# present in DEFAULT_DURATIONS are rendered.
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
GOOGLE_SCENE_ORDER = list(range(1, SCENE_COUNT + 1))


def hold_seconds() -> float:
    """Sum of per-scene holds (ignores crossfade overlap)."""
    return sum(DEFAULT_DURATIONS.values())


def playback_length(
    order: list[int],
    durations: dict[int, float],
    *,
    fade: float = FADE_SECONDS,
) -> float:
    """Final length of *order* after *fade* crossfades between holds."""
    if not order:
        return 0.0
    return sum(durations[n] for n in order) - fade * (len(order) - 1)


def playback_seconds() -> float:
    """Final Google 8-scene length after ``FADE_SECONDS`` crossfades."""
    return playback_length(GOOGLE_SCENE_ORDER, DEFAULT_DURATIONS)


def scene_start_on(
    order: list[int],
    durations: dict[int, float],
    scene: int,
    *,
    fade: float = FADE_SECONDS,
) -> float:
    """Wall-clock second when *scene* begins fading in on *order*."""
    if scene not in order:
        raise ValueError(f"scene {scene} not in order {order}")
    t = 0.0
    for number in order:
        if number == scene:
            return t
        t += durations[number] - fade
    raise ValueError(f"scene {scene} not in order {order}")


def scene_start_second(scene: int) -> float:
    """
    Wall-clock second when scene *scene* (1-based) starts fading in.

    Used by ``generate_music.build_slideshow_prompt`` to align Lyria section
    markers (contemplative → hopeful → finale) with on-screen story beats.
    """
    if scene < 1 or scene > SCENE_COUNT:
        raise ValueError(f"scene must be 1–{SCENE_COUNT}, got {scene}")
    return scene_start_on(GOOGLE_SCENE_ORDER, DEFAULT_DURATIONS, scene)


def music_target_seconds(*, buffer: float = 3.0) -> int:
    """
    Target Lyria track length in whole seconds.

    Lyria Pro often returns ~60s regardless of prompt — ``generate_music.py``
    trims to this value. Buffer adds tail room beyond raw hold sum.
    """
    return int(hold_seconds() + buffer + 0.999)


def format_timestamp(seconds: float) -> str:
    """Format seconds as ``M:SS`` for music prompt section headers (e.g. ``0:18``)."""
    whole = int(seconds)
    return f"0:{whole:02d}"
