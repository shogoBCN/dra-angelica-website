"""
Canonical filesystem paths for the ads-maker toolchain.

All scripts should import paths from here instead of computing ``parents[N]``
locally — getting the repo root wrong was a recurring bug when scripts lived
under ``ads/08-aug-26/video/`` and were later moved to ``scripts/``.

Path resolution
---------------
- ``REPO_ROOT`` — ``dra-angelica-website/`` (contains ``.env.local``, ``web/``, ``ads/``)
- ``resolve(relative)`` — joins relative paths to ``REPO_ROOT``; leaves absolute paths unchanged
- ``DEFAULT_CAMPAIGN`` — active slideshow campaign folder (Aug-26). Change here when
  starting a new campaign, or pass explicit paths via CLI on build scripts.

Google Ads static assets use a separate tree under ``ads/08-aug-26/samples/``;
only slideshow *video* scene PNGs default to ``DEFAULT_CAMPAIGN``.
"""

from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Repo layout (computed once at import)
# ---------------------------------------------------------------------------
# __file__ = …/scripts/ads-maker-scripts/lib/paths.py
#   parents[0] lib
#   parents[1] ads-maker-scripts
#   parents[2] scripts
#   parents[3] dra-angelica-website  ← repo root
REPO_ROOT = Path(__file__).resolve().parents[3]

SCRIPTS_DIR = REPO_ROOT / "scripts" / "ads-maker-scripts"
CONFIGS_DIR = SCRIPTS_DIR / "configs"

# API key + model overrides (never commit this file)
ENV_FILE = REPO_ROOT / ".env.local"

# Brand assets referenced in almost every ad prompt
BRAND_LOGO = REPO_ROOT / "web" / "assets" / "images" / "brand" / "logo-teal.png"

# ---------------------------------------------------------------------------
# Slideshow campaign (Aug-26) — scene PNGs, initials, audio, MP4 outputs
# ---------------------------------------------------------------------------
DEFAULT_CAMPAIGN = REPO_ROOT / "ads" / "08-aug-26" / "video"
INITIALS_DIR = DEFAULT_CAMPAIGN / "initials"
REFERENCE_PATIENT = INITIALS_DIR / "REFERENCE_patient.png"

# Gemini aspect_ratio API value → on-disk folder name
ASPECT_FOLDER: dict[str, str] = {
    "1:1": "1x1",
    "4:5": "4x5",
    "9:16": "9x16",
    "16:9": "16x9",
}


def resolve(path: str | Path) -> Path:
    """
    Resolve *path* relative to ``REPO_ROOT`` unless already absolute.

    Used everywhere config YAML or CLI args mention repo-relative paths like
    ``ads/08-aug-26/samples/v2/02-a-quien-le-haces-caso.png``.

    Examples
    --------
    ``resolve("web/assets/…")`` → absolute path under repo root.
    """
    p = Path(path)
    return p if p.is_absolute() else REPO_ROOT / p
