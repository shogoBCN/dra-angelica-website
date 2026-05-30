# Contact form (Resend + Firebase)

The homepage contact form posts to **`/api/contact`**. Firebase Hosting rewrites that path to the **`submitContact`** HTTPS function, which sends mail via **Resend** to the consultorio inbox.

## What you need before deploy

1. **Firebase Blaze** (pay-as-you-go) on project `dra-angelica-website` — required for outbound HTTPS from Cloud Functions.
2. **Resend account** — [resend.com](https://resend.com)
3. **DNS access** for `medicina-familiar.co` (GoDaddy or wherever DNS is managed)

---

## Step 1 — Resend: domain and API key

1. Sign in at [resend.com](https://resend.com) → **Domains** → **Add domain** → `medicina-familiar.co`
2. Resend shows DNS records (DKIM, SPF, etc.). In **GoDaddy → DNS** (or your DNS host):
   - Add each record Resend lists.
   - **Do not remove** existing **MX** records (they keep `doc.angelica@…` working).
   - If you already have an **SPF** TXT on `@`, **merge** `include:…` into one SPF record (only one SPF TXT per host).
3. Wait until Resend shows the domain as **Verified** (can take minutes to a few hours).
4. **API Keys** → **Create API key** → copy it (`re_…`). Store it somewhere safe; you will paste it once into Firebase secrets.

**Sender address:** use something like `consultorio@medicina-familiar.co` (must be on the verified domain). You do not need a separate mailbox at GoDaddy for that address unless you want to read mail sent *to* it.

---

## Step 2 — Firebase: Blaze plan

1. [Firebase Console](https://console.firebase.google.com/) → project **dra-angelica-website**
2. **Upgrade** to **Blaze** if you are still on Spark (Functions need outbound network)

---

## Step 3 — Firebase secrets (one-time)

From the **repository root**, with Firebase CLI logged in (`npm run firebase -- login`) and project selected (`npm run firebase -- use prod` or `use dra-angelica-website`):

```bash
npm run firebase -- functions:secrets:set RESEND_API_KEY
# Paste the Resend API key when prompted

npm run firebase -- functions:secrets:set CONTACT_TO_EMAIL
# e.g. doc.angelica@medicina-familiar.co

npm run firebase -- functions:secrets:set CONTACT_FROM_EMAIL
# e.g. consultorio@medicina-familiar.co  (must be verified in Resend)
```

To update a secret later, run the same command again.

**Do not keep `firebase/functions/.env` when deploying.** Firebase loads `.env` as normal env vars and deploy fails if the same names exist as secrets (`CONTACT_TO_EMAIL`, etc.). For local emulator keys only, use **`firebase/functions/.env.local`** (copy from `.env.example`).

If you already have `.env`:

```bash
mv firebase/functions/.env firebase/functions/.env.local
```

---

## Step 4 — Install function dependencies and deploy

```bash
conda activate angelica-website
npm run functions:install
npm run deploy:contact
```

If deploy still says `Cannot find package 'firebase-admin'`, run `npm run functions:install` again, then redeploy.

This builds the static site, deploys **functions** + **hosting** (including the `/api/contact` rewrite).

First deploy can take several minutes. If it fails on secrets, complete Step 3 and retry.

---

## Step 5 — Test on production

1. Open **https://medicina-familiar.co/** → contact section → submit a test message.
2. Check **doc.angelica@medicina-familiar.co** (Primary inbox; check Spam once if needed).
3. **Reply** to the message — the reply should go to the visitor’s email (Reply-To).

**curl** (optional):

```bash
curl -sS -X POST "https://medicina-familiar.co/api/contact" \
  -H "Content-Type: application/json" \
  -H "Origin: https://medicina-familiar.co" \
  -d '{"name":"Test","email":"you@example.com","mensaje":"Mensaje de prueba desde curl","_honey":""}'
```

Expect: `{"success":true}`

---

## Local development note

`npx serve web` or `npx serve dist` does **not** run Cloud Functions. The form will only work on **deployed** Hosting (or with the Firebase emulator — not configured in this repo by default). Test on production after deploy.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| Form error, generic message | Firebase Console → **Functions** → **Logs** for `submitContact` |
| Resend error in logs | Domain verified? `CONTACT_FROM_EMAIL` on that domain? API key valid? |
| No email in inbox | `CONTACT_TO_EMAIL` correct? MX records unchanged? Spam folder |
| 403 / origin | Only production origins are allowed for direct function URL; use `https://medicina-familiar.co/api/contact` |
| Deploy fails “secret not found” | Run all three `functions:secrets:set` commands |
| `Secret environment variable overlaps non secret environment variable` | Remove or rename `firebase/functions/.env` → `.env.local`, then redeploy |
| `npm error Invalid tag name "#"` | Do not put shell comments on the same line as `npm run`; run `npm run functions:install` only |

---

## Rollback

Redeploy a previous Git revision, or temporarily restore FormSubmit in `web/index.html` + `main.js` and redeploy hosting only. Keep secrets in Firebase; they are harmless if unused.
