"""
Ken Burns motion filters for ffmpeg slideshow and preview clips.

Why this module exists
----------------------
``zoompan`` in ffmpeg causes visible pixel jitter on slow push-ins. This module
builds a per-frame ``scale`` expression that grows the image smoothly, then
``crop``s back to the output size — center-weighted zoom with no subpixel wobble.

Used by
-------
- ``build_slideshow.prepare_clip`` — each scene still gets a subtle push-in
- ``build_ad_preview.build_hold_clip`` — gentler zoom (0.015 vs 0.03) so on-image
  Spanish copy stays readable during fade-in holds

Constants
---------
``FPS`` and ``ZOOM_AMOUNT`` are tuned for 2048px masters at 30fps. Adjust
``zoom_amount`` per call if preview clips need less motion.
"""

from __future__ import annotations

FPS = 30
# Total zoom over the clip (e.g. 0.03 = 3% push-in from start to end)
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
    """
  Build an ffmpeg ``-vf`` filter chain: pad → scale-by-frame → center crop.

  Parameters
  ----------
  width, height:
      Output frame size in pixels (e.g. 2048×2048 for 1:1 masters).
  frames:
      Total frame count for the clip — zoom interpolates from 0 to
      ``zoom_amount`` over this many frames.
  fps:
      Output frame rate appended at the end of the chain.
  zoom_amount:
      Fractional scale increase by the last frame (0.03 = 3% zoom-in).
  suffix:
      Extra filters appended after crop (e.g. ``fade=t=in:…`` for previews).

  Returns
  -------
  Comma-separated ffmpeg video filter string suitable for ``-vf``.
  """
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
