#!/usr/bin/env python3
"""
Run batch image generation jobs from a YAML config.

This is the main entry point for Google Ads static asset pipelines. Prompts,
paths, aspect ratios, and reference images live in ``configs/*.yaml`` — add a
new job block instead of writing a new Python script per ad.

Examples
--------
Generate every output in a config::

    cd scripts/ads-maker-scripts
    python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml

Single ad, single aspect (re-run after prompt tweak)::

    python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml \\
      --job 02-a-quien-le-haces-caso --aspect 16:9

Preview without API calls::

    python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml --dry-run

Output files
------------
Written to each job's ``output_dir`` using the ``path`` template from YAML
(e.g. ``02-a-quien-le-haces-caso_16x9.png``).

Reference order sent to Gemini
------------------------------
1. Job ``source`` (approved 1:1 master PNG)
2. ``defaults.references`` + job ``references`` (patient face, logo, …)

Jobs with ``copy_source: true`` skip the API and copy ``source`` to the output
(useful for 1:1 when the v2 master is already final).
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lib.aspect_pad import write_padded_temp  # noqa: E402
from lib.config import load_batch_config  # noqa: E402
from lib.gemini import (  # noqa: E402
    format_usage,
    generate_image,
    image_size_for,
    load_env,
    model_cost_usd,
    resolve_model,
)


def reference_paths(job_source: Path | None, job_refs: list[Path]) -> list[Path]:
    """
    Build ordered reference list for one API call.

    Source master is always first so aspect-ratio adaptations stay faithful
    to the approved 1:1 layout and copy.
    """
    paths: list[Path] = []
    if job_source:
        paths.append(job_source)
    paths.extend(job_refs)
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate images from a YAML batch config",
        epilog="Config schema: lib/config.py module docstring.",
    )
    parser.add_argument(
        "config",
        type=Path,
        help="YAML config path (e.g. configs/08-aug-26-google-ads-aspects.yaml)",
    )
    parser.add_argument(
        "--job",
        action="append",
        metavar="ID",
        help="Run only these job id(s); repeatable",
    )
    parser.add_argument(
        "--aspect",
        action="append",
        metavar="RATIO",
        help='Run only these aspect ratios (e.g. "16:9"); repeatable',
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned work without calling Gemini or copying files",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip outputs whose destination file already exists",
    )
    args = parser.parse_args()

    batch = load_batch_config(args.config)
    load_env()

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key and not args.dry_run:
        raise SystemExit("GEMINI_API_KEY not set in .env.local")

    job_filter = set(args.job or [])
    aspect_filter = set(args.aspect or [])

    total_cost = 0.0
    cost_known = False
    ran = 0

    for job in batch.jobs:
        if job_filter and job.id not in job_filter:
            continue

        job.output_dir.mkdir(parents=True, exist_ok=True)
        model = resolve_model(model=job.model, pro=job.pro)
        image_size = image_size_for(model)

        for spec in job.outputs:
            if aspect_filter and spec.aspect_ratio not in aspect_filter:
                continue

            out = job.output_dir / spec.path
            out.parent.mkdir(parents=True, exist_ok=True)
            print(f"\n[{job.id}] {spec.aspect_ratio} → {out}")

            if args.skip_existing and out.exists() and not spec.copy_source:
                print("  skip existing")
                continue

            effective_source = spec.source or job.source
            call_refs = (
                [effective_source]
                if spec.source_only_refs and effective_source
                else reference_paths(effective_source, job.references)
            )
            padded_tmp: Path | None = None
            if spec.pad_source and effective_source:
                padded_tmp = write_padded_temp(effective_source, spec.aspect_ratio)
                call_refs = [padded_tmp, effective_source, *call_refs[1:]]

            # Fast path: 1:1 master already approved in samples/v2
            if spec.copy_source:
                if not effective_source:
                    raise SystemExit(f"Job {job.id}: copy_source requires source")
                if args.dry_run:
                    print("  (copy source)")
                    continue
                shutil.copy2(effective_source, out)
                print(f"  copied from {effective_source.name}")
                ran += 1
                continue

            if args.dry_run:
                print(f"  model: {model}")
                print(f"  refs: {[p.name for p in call_refs]}")
                print(f"  prompt: {spec.prompt[:120].strip()}…")
                continue

            try:
                image_bytes, usage = generate_image(
                    api_key=api_key,  # type: ignore
                    model=model,
                    prompt=spec.prompt,
                    reference_paths=call_refs,
                    aspect_ratio=spec.aspect_ratio,
                    image_size=image_size,
                )
            finally:
                if padded_tmp is not None:
                    padded_tmp.unlink(missing_ok=True)
            out.write_bytes(image_bytes)
            unit_cost = model_cost_usd(model)
            if unit_cost is not None:
                total_cost += unit_cost
                cost_known = True
            ran += 1
            print(f"  saved {len(image_bytes) // 1024} KB")
            print(f"  usage: {format_usage(usage, model)}")

    if args.dry_run:
        print("\nDry run — no API calls.")
    elif cost_known:
        print(f"\nDone. {ran} output(s), est. cost ${total_cost:.2f}")
    else:
        print(f"\nDone. {ran} output(s).")


if __name__ == "__main__":
    main()
