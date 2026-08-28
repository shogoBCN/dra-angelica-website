# Google Indexing API (automated “request indexing”)

Notifies Google when pages are updated. Uses service account **`blog-indexing@dra-angelica-website.iam.gserviceaccount.com`** (Owner in Search Console).

## Key file (local only, gitignored)

Place the JSON key here (already set up):

```text
service_accounts/dra-angelica-website-2760f27f7288.json
```

Or set `GOOGLE_INDEXING_KEY=/path/to/key.json`.

**Never commit** `service_accounts/` — it is in `.gitignore`.

## What runs automatically

| Action | Indexing |
|---|---|
| `node scripts/publish-blog-post.mjs <slug>` | Article URL + `/blog/` |
| `npm run deploy:hosting` | All sitemap URLs (home, cita, blog, landings, every published article) |

## Manual commands

```bash
# One article
npm run index:google -- --slug que-es-la-diabetes

# Any URL
npm run index:google -- https://medicina-familiar.co/campana/un-solo-plan/

# Everything in sitemap.xml
npm run index:google -- --sitemap
```

## GCP / Search Console setup (done)

1. Indexing API enabled on project `dra-angelica-website`
2. Service account `blog-indexing` created with JSON key
3. **`blog-indexing@dra-angelica-website.iam.gserviceaccount.com`** added as **Owner** in Search Console

No extra GCP IAM roles are required on the service account — authorization is via Search Console ownership.

## Expectations

- API `OK` = Google received the notification, not guaranteed indexing
- Submit **canonical** URLs: `/blog/articulo/<slug>/` (not `?slug=…`)
- Recheck Search Console in 1–3 days
