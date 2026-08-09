# Ads maker scripts

Tools for Dra. Angélica ad campaigns: Gemini image generation, slideshow/video builds, music.

Requires conda env `angelica-website` and `.env.local` at repo root (`GEMINI_API_KEY`, optional model overrides).

## Layout

```
scripts/ads-maker-scripts/
├── lib/                    # shared code
│   ├── gemini.py           # Gemini image API client
│   ├── config.py           # YAML batch config loader
│   └── paths.py            # repo + campaign paths
├── configs/                # one YAML per campaign batch (prompts, paths)
│   └── 08-aug-26-google-ads-aspects.yaml
├── gemini_image.py         # single image CLI
├── gemini_batch.py         # batch from YAML
├── generate_scene.py       # slideshow scene images (legacy prompts in-script)
├── generate_video.py       # Veo clips
├── generate_music.py       # Lyria background music
├── build_slideshow.py      # crossfade MP4 from scene PNGs
└── build_ad_preview.py     # paced preview builder
```

Campaign assets live under `ads/08-aug-26/` (video scenes, samples, google-ads-assets).

## Gemini image — one shot

```bash
cd scripts/ads-maker-scripts

python gemini_image.py \
  --prompt-file configs/snippets/my-prompt.txt \
  -r ../../ads/08-aug-26/samples/v2/02-a-quien-le-haces-caso.png \
  -r ../../web/assets/images/brand/logo-teal.png \
  --aspect-ratio 16:9 \
  --pro \
  -o ../../ads/08-aug-26/google-ads-assets/test_16x9.png
```

Or inline prompt:

```bash
python gemini_image.py \
  --prompt "Photorealistic healthcare ad…" \
  -r path/to/reference.png \
  --aspect-ratio 1:1 \
  -o path/to/output.png
```

## Gemini image — batch (YAML)

One config file per campaign under `configs/`, named `{campaign}-google-ads-aspects.yaml`
(e.g. `08-aug-26-google-ads-aspects.yaml` → assets in `ads/08-aug-26/`). For a new
batch, copy the latest YAML, update paths and jobs.

```bash
python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml
python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml --job 02-a-quien-le-haces-caso
python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml --job 02-a-quien-le-haces-caso --aspect 16:9
python gemini_batch.py configs/08-aug-26-google-ads-aspects.yaml --dry-run
```

### YAML structure

- **`defaults`**: `model` (`pro` | `flash` | full model name), shared `references`
- **`fragments`**: reusable prompt blocks (`text`, `visual`, `continuity`, …)
- **`jobs`**: list of campaigns
  - `id`, `source` (1:1 master), `output_dir`, optional `references`
  - `outputs`: each has `aspect_ratio`, `path` (`{id}_16x9.png`), `prompt`, optional `copy_source: true`

Prompts use `{visual}`, `{text}`, `{id}`, etc. from job + fragment variables.

## Slideshow pipeline

```bash
python generate_scene.py 7 --aspects 1:1 9:16 16:9 --pro
python generate_music.py
python build_slideshow.py   # defaults to ads/08-aug-26/video/{1x1,9x16,16x9}
```

## Models

| Flag / env | Default |
|------------|---------|
| `--pro` | `GEMINI_IMAGE_MODEL_PRO` → gemini-3-pro-image-preview |
| (default) | `GEMINI_IMAGE_MODEL` → gemini-2.5-flash-image |
| `--model` | explicit override |
