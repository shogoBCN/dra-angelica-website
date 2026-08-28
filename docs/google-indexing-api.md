# Google Indexing API (automated “request indexing”)

Notifies Google when pages are updated. Uses service account **`blog-indexing@dra-angelica-website.iam.gserviceaccount.com`** (Owner in Search Console).

**Conservative use:** we only auto-submit **new/changed blog URLs** on publish — not the whole site on every deploy (Google documents this API for job/livestream pages; low-volume, targeted use is safer).

## Key file (local only, gitignored)

```text
service_accounts/dra-angelica-website-2760f27f7288.json
```

Or set `GOOGLE_INDEXING_KEY=/path/to/key.json`. Never commit `service_accounts/`.

## What runs automatically

| Action | URLs submitted |
|---|---|
| `node scripts/publish-blog-post.mjs <slug>` | **New** article (+ `/blog/` only on first publish). Re-publishing an existing post sends only that article URL (content update). |
| `npm run deploy:hosting` | **Nothing** (deploy only) |

## Manual commands (when you choose)

```bash
# One new article (same as publish hook)
npm run index:google -- --slug que-es-la-diabetes

# One new landing page or static page
npm run index:google -- https://medicina-familiar.co/campana/un-solo-plan/

# Full sitemap — only after a big launch or bulk catch-up (use sparingly)
npm run index:google -- --sitemap
```

Typical workflows:

- **New blog:** `publish-blog-post` → `deploy:hosting` (indexing runs on publish)
- **New landing page:** `deploy:hosting` then `npm run index:google -- <that-url>`
- **Many new pages at once:** deploy, then once: `npm run index:google -- --sitemap`

## Setup (done)

1. Indexing API enabled on `dra-angelica-website`
2. Service account `blog-indexing` + JSON key
3. SA email added as **Owner** in Search Console

No extra GCP IAM roles needed — authorization is via Search Console ownership.

## Expectations

- API `OK` = notification received, not guaranteed indexing
- Use **canonical** URLs: `/blog/articulo/<slug>/`
- Recheck Search Console in 1–3 days
