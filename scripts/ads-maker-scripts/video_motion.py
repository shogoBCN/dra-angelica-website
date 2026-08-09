"""Smooth Ken Burns motion (avoids zoompan pixel jitter)."""

from __future__ import annotations

FPS = 30
# Total zoom over the clip (e.g. 0.03 = 3% push-in)
ZOOM_AMOUNT = 0.03


def ken_burns_vf(
    width: int,
    height: int,
    frames: int,
    *,
    fps: int = FPS,
    zoom_amount: float = ZOOM_AMOUNT,
    suffix: str = "",
) -> str:
    """Center-crop zoom via per-frame scale — much smoother than zoompan."""
    denom = max(frames, 1)
    tail = f",{suffix}" if suffix else ""
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,"
        f"setsar=1,"
        f"scale=w='iw*(1+{zoom_amount}*n/{denom})':"
        f"h='ih*(1+{zoom_amount}*n/{denom})':eval=frame,"
        f"crop={width}:{height}:x='(iw-ow)/2':y='(ih-oh)/2'"
        f"{tail},fps={fps},format=yuv420p"
    )
