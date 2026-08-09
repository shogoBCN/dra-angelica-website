"""
Shared library for Dra. Angélica ads-maker scripts.

This package is imported by CLI entry points in ``scripts/ads-maker-scripts/``.
It centralises:

- **paths** — repo-root resolution and campaign asset locations
- **gemini** — Gemini *image* REST API (generateContent + imageConfig)
- **config** — YAML batch job loader for ``gemini_batch.py``

Design goals
------------
- One Gemini client used by ``gemini_image.py``, ``gemini_batch.py``, and
  ``generate_scene.py`` (slideshow scenes still carry legacy in-script prompts).
- Paths always resolve from ``REPO_ROOT`` so scripts work regardless of cwd.
- Batch jobs are data-driven (YAML) rather than one-off Python scripts per ad.

Typical call graph::

    gemini_batch.py  →  lib.config.load_batch_config()
                     →  lib.gemini.generate_image()

    gemini_image.py  →  lib.gemini.generate_image()

    generate_scene.py → lib.gemini.generate_image()  (scene prompts in-file)
"""
