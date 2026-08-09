"""
YAML batch configuration loader for ``gemini_batch.py``.

Configs live in ``scripts/ads-maker-scripts/configs/*.yaml``. Each file
describes one or more *jobs* (e.g. a static ad id) and multiple *outputs*
(aspect-ratio variants).

Schema overview
---------------
::

    defaults:           # optional — applied to every job
      model: pro|flash|<full model name>
      references: [repo-relative paths…]

    fragments:          # optional — named prompt blocks, Python .format() vars
      text: |
        …
      visual: |
        …

    jobs:
      - id: 02-a-quien-le-haces-caso
        source: ads/…/master-1x1.png    # attached first; optional if copy-only
        output_dir: ads/…/google-ads-assets
        references: []                  # extra refs; merged after defaults
        use_default_references: true     # set false for doctor ads (skip patient ref)
        model: pro                      # optional override
        outputs:
          - aspect_ratio: "16:9"
            path: "{id}_16x9.png"       # .format(id=…, **fragments)
            prompt: |
              TASK: …
              {visual}
              {text}
            copy_source: false          # if true, shutil.copy source → path

Prompt templating uses ``str.format``. Available variables per job:
``id``, plus every key under ``fragments`` (global + job-level overrides).

Reference image order at API call time
--------------------------------------
1. ``job.source`` (approved 1:1 master)
2. ``defaults.references`` + ``job.references`` (patient identity, logo, …)
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from lib.paths import CONFIGS_DIR, resolve


@dataclass
class OutputSpec:
    """One generated file: aspect ratio, destination filename, resolved prompt."""

    aspect_ratio: str
    path: str
    prompt: str
    copy_source: bool = False


@dataclass
class JobSpec:
    """One logical ad/creative (may produce multiple aspect-ratio PNGs)."""

    id: str
    source: Path | None
    output_dir: Path
    references: list[Path]
    outputs: list[OutputSpec]
    model: str | None = None
    pro: bool = False


@dataclass
class BatchConfig:
    """Parsed YAML file — defaults + list of jobs."""

    defaults_model: str | None
    defaults_pro: bool
    defaults_references: list[Path]
    jobs: list[JobSpec]


def _as_bool(value: Any, default: bool = False) -> bool:
    """Parse YAML truthy values (bool, or strings like ``yes`` / ``true``)."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "pro"}


def _model_flags(raw: str | None) -> tuple[str | None, bool]:
    """
    Normalise ``defaults.model`` / ``job.model`` YAML values.

    Returns ``(explicit_model_name_or_none, use_pro_flag)``.
    Shorthands: ``pro`` → pro env model; ``flash`` → flash env model.
    """
    if not raw:
        return None, False
    if raw.lower() == "pro":
        return None, True
    if raw.lower() == "flash":
        return None, False
    return raw, False


def format_prompt(template: str, variables: dict[str, str]) -> str:
    """
    Apply ``.format(**variables)`` to a prompt or path template.

    Raises ``SystemExit`` with the missing key name if a ``{placeholder}``
    is not defined — catches typos in YAML early.
    """
    try:
        return template.format(**variables)
    except KeyError as exc:
        raise SystemExit(f"Prompt template missing variable: {exc}") from exc


def load_batch_config(path: Path) -> BatchConfig:
    """
    Load and validate a batch YAML config.

    Path resolution
    ---------------
    - Absolute path → use as-is
    - Path relative to cwd if it exists
    - Else ``configs/<path>`` under ads-maker-scripts
    - Else ``configs/<basename>`` (so ``08-aug-26-google-ads-aspects.yaml`` works)
    """
    if path.is_absolute():
        config_path = path
    elif path.exists():
        config_path = path.resolve()
    else:
        candidate = CONFIGS_DIR / path
        config_path = candidate if candidate.exists() else CONFIGS_DIR / path.name

    if not config_path.exists():
        raise SystemExit(f"Config not found: {path} (tried {config_path})")

    raw = yaml.safe_load(config_path.read_text())
    if not isinstance(raw, dict):
        raise SystemExit(f"Invalid config (expected mapping): {config_path}")

    defaults = raw.get("defaults") or {}
    def_model, def_pro = _model_flags(defaults.get("model"))
    def_refs = [resolve(p) for p in defaults.get("references") or []]

    # Global fragments become format variables for every job
    fragments: dict[str, str] = {}
    for key, value in (raw.get("fragments") or {}).items():
        fragments[str(key)] = str(value).rstrip() + "\n"

    jobs: list[JobSpec] = []
    for entry in raw.get("jobs") or []:
        job_id = entry["id"]
        # Job-level fragments override globals (same key name)
        job_frags = {**fragments, **(entry.get("fragments") or {})}
        variables = {"id": job_id, **job_frags}

        source_raw = entry.get("source")
        source = resolve(source_raw) if source_raw else None

        job_model, job_pro = _model_flags(entry.get("model"))
        if job_model is None and not entry.get("model"):
            job_model, job_pro = def_model, def_pro
        else:
            job_pro = job_pro or def_pro

        refs = [resolve(p) for p in entry.get("references") or []]
        use_def_refs = entry.get("use_default_references", True)
        if isinstance(use_def_refs, str):
            use_def_refs = use_def_refs.lower() not in {"0", "false", "no"}
        all_refs = (def_refs if use_def_refs else []) + refs

        outputs: list[OutputSpec] = []
        for out in entry.get("outputs") or []:
            prompt_template = out.get("prompt") or entry.get("prompt") or ""
            if not prompt_template:
                raise SystemExit(f"Job {job_id}: output missing prompt")
            prompt = format_prompt(str(prompt_template).rstrip() + "\n", variables)
            path_template = out.get("path") or "{id}.png"
            outputs.append(
                OutputSpec(
                    aspect_ratio=out["aspect_ratio"],
                    path=format_prompt(path_template, variables),
                    prompt=prompt,
                    copy_source=_as_bool(out.get("copy_source")),
                )
            )

        jobs.append(
            JobSpec(
                id=job_id,
                source=source,
                output_dir=resolve(entry["output_dir"]),
                references=all_refs,
                outputs=outputs,
                model=job_model,
                pro=job_pro,
            )
        )

    return BatchConfig(
        defaults_model=def_model,
        defaults_pro=def_pro,
        defaults_references=def_refs,
        jobs=jobs,
    )
