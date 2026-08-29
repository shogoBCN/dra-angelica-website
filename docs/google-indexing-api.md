# Google indexing scripts

Automates two related tasks for **medicina-familiar.co**:

1. **Notify Google** when pages change (Indexing API — “request indexing”).
2. **Check index status** for sitemap URLs (Search Console URL Inspection API).

Service account: **`blog-indexing@dra-angelica-website.iam.gserviceaccount.com`** (must be **Owner** on the Search Console **Domain** property `medicina-familiar.co`).

**Policy:** we submit URLs **selectively** (on blog publish or when you run a manual command). **`npm run deploy:hosting` does not ping Google** — deploy only builds and uploads `dist/`.

---

## Quick reference

| npm script | Script | Purpose |
| --- | --- | --- |
| `npm run publish:blog -- <slug>` | `scripts/publish-blog-post.mjs` | Publish to Firestore + manifest; **auto-submits** article URL to Indexing API (see below) |
| `npm run deploy:hosting` | build + Firebase deploy | **No** indexing calls |
| `npm run index:google -- …` | `scripts/request-google-indexing.mjs` | Manual Indexing API submit |
| `npm run index:google:check` | `scripts/check-google-index-status.mjs` | Check which sitemap URLs are indexed / not indexed |

---

## What runs automatically

### On blog publish (`publish-blog-post.mjs`)

When a post is saved with **`published: true`** and a service account key is present:

| Situation | URLs submitted to Indexing API |
| --- | --- |
| **First time** this slug is published | Article URL + `/blog/` (listing page) |
| **Re-publish** (slug already published before) | Article URL only |
| Draft (`published: false`) | Nothing |
| No key file (`service_accounts/*.json`) | Skipped (publish still succeeds) |

Example output after publish:

```text
Google indexing: 2/2 URLs submitted.
```

Always use **canonical** article URLs: `https://medicina-familiar.co/blog/articulo/<slug>/`

### On deploy (`deploy:hosting`)

**Nothing.** Rationale: the Indexing API is meant for low-volume, URL-specific updates. Bulk-submitting the whole sitemap on every deploy adds noise and is unnecessary when blog publish already notifies Google for new articles.

---

## Manual commands

### Check index status

Uses the same data as Search Console → **URL inspection** (`coverageState`, last crawl, etc.).

```bash
# All URLs in sitemap.xml (static pages + published blog articles)
npm run index:google:check

# One URL
npm run index:google:check -- --url https://medicina-familiar.co/blog/articulo/que-es-la-diabetes/

# Check, then submit Indexing API pings only for URLs still not indexed
npm run index:google:check -- --submit-not-indexed
```

Example output:

```text
✓  https://medicina-familiar.co/blog/
    Enviada e indexada
✗  https://medicina-familiar.co/blog/articulo/hipertension-arterial/
    Rastreada: actualmente sin indexar

Summary: 8 indexed, 2 not indexed, 0 errors
```

Exit code **1** if any URL is not indexed or if API errors occurred (useful in CI or scripts).

### Submit indexing requests manually

```bash
# One article (same URLs as publish hook)
npm run index:google -- --slug que-es-la-diabetes

# One landing or static page
npm run index:google -- https://medicina-familiar.co/campana/un-solo-plan/

# Full sitemap — bulk catch-up only (use sparingly)
npm run index:google -- --sitemap
```

---

## Typical workflows

### New blog post

```bash
node scripts/publish-blog-post.mjs <slug>   # Firestore + manifest + Indexing API
npm run build
npm run deploy:hosting
npm run index:google:check                  # optional: verify after a day or two
```

Indexing runs at **publish** time (before deploy). That is fine: Google is notified that the URL exists; the live HTML must be deployed before Google crawls. Publish → deploy in one session is the intended order.

### New landing page (no blog publish script)

```bash
npm run deploy:hosting
npm run index:google -- https://medicina-familiar.co/campana/un-solo-plan/
```

### Several pages still “Crawled – currently not indexed”

```bash
npm run index:google:check -- --submit-not-indexed
```

Wait 1–3 days, then run `npm run index:google:check` again.

### Big launch (many new URLs at once)

```bash
npm run deploy:hosting
npm run index:google -- --sitemap    # once, not on every deploy
```

---

## Script files (`scripts/` — local, gitignored in this repo)

| File | Role |
| --- | --- |
| `publish-blog-post.mjs` | Firestore publish; calls Indexing API when `published` |
| `request-google-indexing.mjs` | CLI for manual Indexing API submits |
| `check-google-index-status.mjs` | CLI for Search Console URL Inspection |
| `lib/google-indexing.mjs` | Service account auth + Indexing API |
| `lib/search-console-inspect.mjs` | URL Inspection API |
| `lib/site-urls.mjs` | Sitemap URL list, canonical article URLs, `GSC_SITE_URL` default |

URL list for `--sitemap` / default check: static pages from `build-site.mjs` + slugs from `web/assets/data/blog-posts.json`.

---

## Setup

### 1. GCP project `dra-angelica-website`

Enable:

- [Indexing API](https://console.cloud.google.com/apis/library/indexing.googleapis.com)
- [Google Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com) (required for `index:google:check` only)

### 2. Service account key (local only)

```text
service_accounts/dra-angelica-website-2760f27f7288.json
```

Or set in `.env.local`:

```bash
GOOGLE_INDEXING_KEY=/absolute/path/to/key.json
```

Never commit `service_accounts/`.

### 3. Search Console

1. **Domain** property: `medicina-familiar.co` (not URL-prefix only).
2. **Settings → Users and permissions** → add **`blog-indexing@dra-angelica-website.iam.gserviceaccount.com`** as **Owner**.

### 4. Environment (optional)

In `.env.local` (see `.env.example`):

```bash
GOOGLE_INDEXING_KEY=
GSC_SITE_URL=sc-domain:medicina-familiar.co
```

**Important:** the URL Inspection API needs the **exact** property ID. This site uses **`sc-domain:medicina-familiar.co`**, not `https://medicina-familiar.co/`. The check script defaults to the domain property; override with `GSC_SITE_URL` only if your GSC setup differs.

No extra GCP IAM roles on the service account — access is granted via Search Console ownership.

---

## Expectations

- Indexing API **`OK`** = Google received the notification, **not** guaranteed indexing.
- “Not indexed” in the check script = GSC coverage state (e.g. *Rastreada: actualmente sin indexar*), not a live Google Search query.
- Recheck with `npm run index:google:check` after 1–3 days.
- Prefer canonical paths (`/blog/articulo/<slug>/`); legacy `?slug=` URLs may still appear in GSC until Google consolidates.

---

## Troubleshooting

| Error | Fix |
| --- | --- |
| `Search Console API has not been used… or it is disabled` | Enable Search Console API in GCP (link in error message); wait ~2 minutes |
| `You do not own this site, or the inspected URL is not part of this property` | Set `GSC_SITE_URL=sc-domain:medicina-familiar.co` (or match your GSC property exactly) |
| `Google indexing skipped` on publish | Add key under `service_accounts/` or set `GOOGLE_INDEXING_KEY` |
| Publish shows `0/N URLs submitted` | SA not Owner in GSC, wrong project, or Indexing API disabled |
| All URLs indexed in check but GSC UI differs | UI can lag; inspection API is the source the script uses |

---

## Related docs

- Main README — deployment and Search Console domain setup
- `blogs.example/README.md` — local draft → publish workflow
- `.env.example` — `GOOGLE_INDEXING_KEY`, `GSC_SITE_URL`
