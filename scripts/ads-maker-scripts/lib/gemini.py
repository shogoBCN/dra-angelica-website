"""
Gemini image generation client (REST, no google-genai SDK).

Uses the ``generateContent`` endpoint with ``responseModalities: ["IMAGE"]``
and ``imageConfig.aspectRatio``. Reference images are sent as inline base64
before the text prompt — same pattern as Nano Banana / Gemini image models.

Environment (``.env.local`` at repo root)
-----------------------------------------
GEMINI_API_KEY              Required for all calls.
GEMINI_IMAGE_MODEL            Default fast model (gemini-2.5-flash-image).
GEMINI_IMAGE_MODEL_PRO        Higher quality (gemini-3-pro-image-preview).
GEMINI_IMAGE_SIZE             Optional, e.g. ``2K`` — only applied for *pro* models.
GEMINI_COST_<model_slug>      Override per-image cost estimate (dashes → underscores).

Supported aspect ratios (API)
-----------------------------
``1:1``, ``4:5``, ``9:16``, ``16:9`` (and others per Google docs). Google Ads
static sets use all four; slideshow scenes use ``1:1``, ``9:16``, ``16:9``.

Error handling
--------------
HTTP 429 with billing / quota messages is mapped to actionable ``SystemExit``
text (prepay depleted, free tier blocked). Other errors include response body.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from lib.paths import ENV_FILE

# Rough USD per image for CLI cost summaries — override via GEMINI_COST_* env vars
MODEL_COST_USD: dict[str, float] = {
    "gemini-2.5-flash-image": 0.04,
    "gemini-3.1-flash-image": 0.07,
    "gemini-3-pro-image-preview": 0.13,
}


def load_env() -> None:
    """
    Load ``.env.local`` into ``os.environ`` (setdefault — does not overwrite).

    Called once at CLI startup. Missing file is fatal because ``GEMINI_API_KEY``
    is required for generation.
    """
    if not ENV_FILE.exists():
        raise SystemExit(f"Missing {ENV_FILE}")
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def resolve_model(*, model: str | None = None, pro: bool = False) -> str:
    """
    Pick model id from explicit arg, ``--pro`` flag, or env defaults.

    Parameters
    ----------
    model:
        Full model name; wins over everything else.
    pro:
        If True and *model* is None, use ``GEMINI_IMAGE_MODEL_PRO``.
    """
    if model:
        return model
    if pro:
        return os.environ.get("GEMINI_IMAGE_MODEL_PRO", "gemini-3-pro-image-preview")
    return os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")


def image_size_for(model: str) -> str | None:
    """
    Return ``GEMINI_IMAGE_SIZE`` (e.g. ``2K``) for pro models, else None.

    Flash models ignore imageSize in the API; sending it can cause errors.
    """
    return os.environ.get("GEMINI_IMAGE_SIZE", "2K") if "pro" in model else None


def b64_image(path: Path) -> dict:
    """
    Build a Gemini ``inline_data`` part for a local PNG/JPEG reference image.

    Reference order matters for the model: typically source ad first, then
    identity refs (patient face), then logo.
    """
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    data = base64.standard_b64encode(path.read_bytes()).decode("ascii")
    return {"inline_data": {"mime_type": mime, "data": data}}


def model_cost_usd(model: str) -> float | None:
    """Estimated cost per image for *model*, or None if unknown."""
    env_key = f"GEMINI_COST_{model.replace('-', '_').replace('.', '_')}"
    override = os.environ.get(env_key)
    if override:
        try:
            return float(override)
        except ValueError:
            pass
    return MODEL_COST_USD.get(model)


def format_usage(usage: dict | None, model: str) -> str:
    """Human-readable token counts + estimated cost for CLI logging."""
    parts: list[str] = []
    if usage:
        prompt_tok = usage.get("promptTokenCount")
        output_tok = usage.get("candidatesTokenCount") or usage.get(
            "candidates_token_count"
        )
        total_tok = usage.get("totalTokenCount")
        if prompt_tok is not None:
            parts.append(f"prompt {prompt_tok:,} tok")
        if output_tok is not None:
            parts.append(f"output {output_tok:,} tok")
        if total_tok is not None and not parts:
            parts.append(f"{total_tok:,} tok total")

    cost = model_cost_usd(model)
    if cost is not None:
        parts.append(f"est. ${cost:.2f}")
    elif not parts:
        parts.append("cost unknown (set GEMINI_COST_* in .env.local)")
    return " · ".join(parts)


def generate_image(
    *,
    api_key: str,
    model: str,
    prompt: str,
    reference_paths: list[Path],
    aspect_ratio: str,
    image_size: str | None = None,
) -> tuple[bytes, dict | None]:
    """
    Call Gemini image generation and return raw PNG/JPEG bytes.

    Parameters
    ----------
    api_key:
        From ``GEMINI_API_KEY``.
    model:
        e.g. ``gemini-3-pro-image-preview``.
    prompt:
        Full text prompt (layout, copy rules, composition per aspect).
    reference_paths:
        Local images attached *before* the prompt. First ref is usually the
        approved 1:1 master when adapting aspect ratios.
    aspect_ratio:
        API value: ``"1:1"``, ``"4:5"``, ``"9:16"``, ``"16:9"``, etc.
    image_size:
        Optional ``2K`` etc. for pro models only.

    Returns
    -------
    (image_bytes, usage_metadata)

    Raises
    ------
    FileNotFoundError
        Missing reference path.
    SystemExit
        API / quota errors, or response without image data.
    """
    parts: list[dict] = []
    for path in reference_paths:
        if not path.exists():
            raise FileNotFoundError(path)
        parts.append(b64_image(path))
    # Text prompt always last — matches Gemini multimodal convention
    parts.append({"text": prompt})

    image_config: dict[str, str] = {"aspectRatio": aspect_ratio}
    if image_size and "pro" in model:
        image_config["imageSize"] = image_size

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": image_config,
        },
    }

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 429:
            if "prepayment credits are depleted" in detail.lower():
                raise SystemExit(
                    "API error 429: Prepay credits depleted.\n"
                    "Add credits: https://aistudio.google.com → Billing"
                ) from exc
            if "free_tier" in detail:
                raise SystemExit(
                    f"API error {exc.code}: Image models require billing.\n"
                    f"Details: {detail[:800]}"
                ) from exc
        raise SystemExit(f"API error {exc.code}: {detail}") from exc

    usage = payload.get("usageMetadata") or payload.get("usage_metadata")

    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.standard_b64decode(inline["data"]), usage

    raise SystemExit(f"No image in response:\n{json.dumps(payload, indent=2)[:2000]}")
