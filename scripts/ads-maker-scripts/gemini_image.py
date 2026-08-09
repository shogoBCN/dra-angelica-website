#!/usr/bin/env python3
"""
Generate a single image via the Gemini image API.

Low-level CLI around ``lib.gemini.generate_image``. Use this for one-off
experiments; for production ad sets prefer ``gemini_batch.py`` + YAML config.

Examples
--------
From repo root (paths may be repo-relative)::

    cd scripts/ads-maker-scripts

    python gemini_image.py \\
      --prompt-file /tmp/prompt.txt \\
      -r ../../ads/08-aug-26/samples/v2/02-a-quien-le-haces-caso.png \\
      -r ../../web/assets/images/brand/logo-teal.png \\
      --aspect-ratio 16:9 \\
      --pro \\
      -o ../../ads/08-aug-26/google-ads-assets/test_16x9.png

Inline prompt::

    python gemini_image.py \\
      --prompt "Photorealistic grayscale healthcare ad…" \\
      --aspect-ratio 1:1 \\
      -o /tmp/out.png

Requires ``GEMINI_API_KEY`` in ``.env.local`` at repo root.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Allow ``from lib.…`` when executed as ``python gemini_image.py`` from this dir
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib.gemini import (  # noqa: E402
    format_usage,
    generate_image,
    image_size_for,
    load_env,
    model_cost_usd,
    resolve_model,
)
from lib.paths import resolve  # noqa: E402


def read_prompt(args: argparse.Namespace) -> str:
    """Return prompt text from ``--prompt`` or ``--prompt-file`` (mutually exclusive)."""
    if args.prompt and args.prompt_file:
        raise SystemExit("Use --prompt or --prompt-file, not both")
    if args.prompt_file:
        path = resolve(args.prompt_file)
        return path.read_text()
    if args.prompt:
        return args.prompt
    raise SystemExit("Provide --prompt or --prompt-file")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate one image with Gemini (prompt + optional reference images)",
        epilog="See README.md for model flags and .env.local variables.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        required=True,
        help="Output image path (repo-relative or absolute)",
    )
    parser.add_argument("--prompt", help="Prompt text")
    parser.add_argument(
        "--prompt-file",
        type=Path,
        help="Read prompt from file (repo-relative or absolute)",
    )
    parser.add_argument(
        "-r",
        "--reference",
        type=Path,
        action="append",
        default=[],
        help="Reference image path, repeatable (order preserved)",
    )
    parser.add_argument(
        "--aspect-ratio",
        default="1:1",
        help='Gemini imageConfig aspectRatio (default: "1:1")',
    )
    parser.add_argument("--model", default=None, help="Full model name override")
    parser.add_argument(
        "--pro",
        action="store_true",
        help="Use GEMINI_IMAGE_MODEL_PRO from .env.local",
    )
    args = parser.parse_args()

    load_env()
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY not set in .env.local")

    prompt = read_prompt(args)
    refs = [resolve(p) for p in args.reference]
    output = resolve(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    model = resolve_model(model=args.model, pro=args.pro)
    image_size = image_size_for(model)

    print(f"Generating → {output}")
    print(f"  model: {model}")
    print(f"  aspect: {args.aspect_ratio}")
    print(f"  refs: {[p.name for p in refs]}")

    image_bytes, usage = generate_image(
        api_key=api_key,
        model=model,
        prompt=prompt,
        reference_paths=refs,
        aspect_ratio=args.aspect_ratio,
        image_size=image_size,
    )
    output.write_bytes(image_bytes)
    print(f"  saved {len(image_bytes) // 1024} KB")
    print(f"  usage: {format_usage(usage, model)}")

    cost = model_cost_usd(model)
    if cost is not None:
        print(f"Done. Est. cost: ${cost:.2f}")


if __name__ == "__main__":
    main()
