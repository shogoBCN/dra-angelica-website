# Blog drafts (local only)

Copy this folder to `blogs/` at the repo root (gitignored). One subdirectory per post:

```
blogs/
  <slug>/
    post.json   # slug, title, excerpt, published; optional coverImageUrl, coverImageAlt, categories
    body.html   # article HTML (Quill-compatible); first <img> used as thumbnail if no coverImageUrl
```

## Publish workflow

```bash
node scripts/publish-blog-post.mjs <slug>   # Firestore + web/assets/data/blog-posts.json
npm run build
npm run deploy:hosting
```

Images live under `web/assets/images/` (`brand/`, `about/`, `medfam/`, `cita/`, `blog/`, `carousel/`). The blog list reads `web/assets/data/blog-posts.json` (regenerated on publish).

The `blogs/` folder is not deployed: hosting serves `dist/` only (built from `web/`).

### Google indexing (automatic on publish)

When `post.json` has `"published": true` and a service account key exists under `service_accounts/`:

| First publish of this slug | Submits article URL + `/blog/` |
| --- | --- |
| Re-publish (content update) | Submits article URL only |

**Deploy does not submit URLs** — only `publish-blog-post.mjs` (and manual commands below).

Check which sitemap URLs are not indexed yet:

```bash
npm run index:google:check
npm run index:google:check -- --submit-not-indexed   # check + ping not-indexed URLs
```

Setup (service account, Search Console, env vars): **`docs/google-indexing-api.md`**.

## Categories and related links

Category slugs for `post.json` / `web/assets/data/blog-post-categories.json`: `hipertension`, `diabetes`, `prevencion`, `medicina-familiar`, `pacientes-mayores`. After editing categories, run `node scripts/sync-blog-categories.mjs` then `node scripts/publish-blog-post.mjs --refresh-manifest`.

Related articles (“Ver también”) are curated manually in `web/assets/data/blog-post-related.json`: each key is a post slug, value is an array of 2–3 related post slugs (titles are resolved from the manifest at runtime). Edit the JSON, then `npm run deploy:hosting`.
