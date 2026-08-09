"""
Build temporary padded reference canvases for Gemini aspect-ratio jobs.

Gemini often horizontally stretches people when adapting 1:1 masters to 4:5 or
16:9. Sending a canvas with the master centered and solid magenta side/top/bottom
bands tells the model to outpaint only those bands — not rescale the subjects.

This does **not** produce the final ad; ``gemini_batch.py`` writes a temp PNG,
attaches it as reference #1, and still calls the image API for the output.
"""

from __future__ import annotations

import io
import tempfile
from pathlib import Path

from PIL import Image

# Distinct outpaint mask color — not present in the photo scene
PAD_COLOR = (255, 0, 255)

def pad_source_to_aspect(
    source: Path,
    aspect_ratio: str,
    *,
    output_size: tuple[int, int] | None = None,
) -> bytes:
    """
    Letterbox/pillarbox *source* onto a canvas matching *aspect_ratio*.

    The source image is pasted at native resolution (no scaling). Empty bands
    are filled with ``PAD_COLOR`` for the model to outpaint.
    """
    w_ratio, h_ratio = (int(x) for x in aspect_ratio.split(":"))
    target = w_ratio / h_ratio
    im = Image.open(source).convert("RGB")
    w, h = im.size
    current = w / h
    if current > target:
        canvas_w, canvas_h = w, int(round(w / target))
    else:
        canvas_w, canvas_h = int(round(h * target)), h
    canvas = Image.new("RGB", (canvas_w, canvas_h), PAD_COLOR)
    canvas.paste(im, ((canvas_w - w) // 2, (canvas_h - h) // 2))
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def write_padded_temp(source: Path, aspect_ratio: str) -> Path:
    """Write padded PNG to a temp file; caller deletes when done."""
    data = pad_source_to_aspect(source, aspect_ratio)
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.write(data)
    tmp.close()
    return Path(tmp.name)
