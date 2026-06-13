# Blog drafts (local only)

Copy this folder to `blogs/` at the repo root (gitignored). One subdirectory per post:

```
blogs/
  <slug>/
    post.json   # slug, title, excerpt, published; optional coverImageUrl, coverImageAlt
    body.html   # article HTML (Quill-compatible); first <img> used as thumbnail if no coverImageUrl
```

Publish to Firestore:

```bash
node scripts/publish-blog-post.mjs <slug>
```

Images live under `web/assets/images/` (`brand/`, `about/`, `medfam/`, `cita/`, `blog/`, `carousel/`). The blog list reads `web/assets/data/blog-posts.json` (regenerated on publish).

The `blogs/` folder is not deployed: hosting serves `dist/` only (built from `web/`).
