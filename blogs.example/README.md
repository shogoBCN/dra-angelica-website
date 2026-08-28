# Blog drafts (local only)

Copy this folder to `blogs/` at the repo root (gitignored). One subdirectory per post:

```
blogs/
  <slug>/
    post.json   # slug, title, excerpt, published; optional coverImageUrl, coverImageAlt, categories
    body.html   # article HTML (Quill-compatible); first <img> used as thumbnail if no coverImageUrl
```

Publish to Firestore:

```bash
node scripts/publish-blog-post.mjs <slug>
```

Images live under `web/assets/images/` (`brand/`, `about/`, `medfam/`, `cita/`, `blog/`, `carousel/`). The blog list reads `web/assets/data/blog-posts.json` (regenerated on publish).

The `blogs/` folder is not deployed: hosting serves `dist/` only (built from `web/`).

Category slugs for `post.json` / `web/assets/data/blog-post-categories.json`: `hipertension`, `diabetes`, `prevencion`, `medicina-familiar`. After editing categories, run `node scripts/sync-blog-categories.mjs` then `node scripts/publish-blog-post.mjs --refresh-manifest`.

Related articles (“Ver también”) are curated manually in `web/assets/data/blog-post-related.json`: each key is a post slug, value is an array of 2–3 related post slugs (titles are resolved from the manifest at runtime). Edit the JSON, then `npm run deploy:hosting`.
