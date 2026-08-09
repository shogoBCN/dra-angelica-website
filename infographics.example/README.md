# Infographics (local sources)

Working infographic files live in `infographics/` at the repo root (gitignored). Copy this folder to get started:

```bash
cp -R infographics.example infographics
```

Place source PNGs here, then build the website PDFs:

```bash
npm run build:infographics
```

Outputs are written to `web/assets/downloads/` and deployed with the site.

## Current assets

| Source PNG | Website PDF |
| ---------- | ----------- |
| `mide-tu-presion-en-casa-angelica.png` | `web/assets/downloads/mide-tu-presion-en-casa.pdf` |

`npm run build` runs the infographic step automatically when sources are present.
