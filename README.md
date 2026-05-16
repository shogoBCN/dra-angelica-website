# Dra. Angélica — website

Static **frontend** (visitor-facing copy in **Colombian Spanish**) and **Firebase** (Hosting + optional Firestore for blog posts). **Repository and technical docs are in English;** only the on-screen content under `web/` is Spanish (`lang="es-CO"`).

## Repository layout


| Path            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `web/`          | Source pages (home, secondary article), **`blog/`** subtree, shared **`assets/`** |
| `dist/`         | **Build output** (generated; do not edit). Deploy this folder. |
| `scripts/`      | Build tooling (`build-site.mjs`)                               |
| `firebase/`     | `firestore.rules`, `firestore.indexes.json`                    |
| `firebase.json` | Firebase Hosting + Firestore paths, security **headers**       |


## Security notes

- **Secrets:** do not commit `.env`, service account JSON, or private keys. `.gitignore` lists common patterns; use `firebase functions:config:set` or Secret Manager for real secrets later.
- **Firestore:** rules live in `firebase/firestore.rules` (default deny outside `posts/`).
- **Hosting:** `firebase.json` sets security headers (HSTS, `X-Frame-Options`, `Referrer-Policy`, etc.). **Content-Security-Policy** lives in **`web/index.html`**, **`web/medicina-familiar-colombia.html`**, and per-page on **`web/blog/**/*.html`** (Firebase SDK CDN, and jsDelivr for Quill on `/blog/admin`). (`frame-ancestors` belongs in a **response header**, not meta.)

## Conda environment (Node + Firebase CLI)

Use a Conda env so Node/npm are reproducible; `firebase-tools` is a **project devDependency** (no global `npm i -g`).

```bash
conda env create -f environment.yml   # once
conda activate angelica-website
npm install                           # installs firebase-tools into node_modules
```

Run Firebase via npm scripts, for example:

```bash
npm run firebase -- login
npm run firebase -- use --add
npm run deploy:firestore
npm run deploy:hosting
```

## Run locally

You need **Node.js** (any recent LTS) so `npm` / `npx` work. From the **repository root**:

### Develop against source (`web/`)

Use this while editing HTML, CSS, or JS. Serves the same tree Firebase builds from (paths stay correct).

```bash
npx --yes serve web
```

Open the URL shown in the terminal (often **[http://localhost:3000](http://localhost:3000)**). Stop with `Ctrl+C`.

If you use the Conda env from this repo, activate it first (`conda activate angelica-website`); `npx` still downloads the `serve` package on first use.

### Preview the production bundle (`dist/`)

Matches what gets deployed after `npm run build`:

```bash
npm run build
npx --yes serve dist
```

Again, open the printed localhost URL.

### Notes

- Do **not** rely on opening `web/index.html` via `file://` in the browser; use a local server as above.
- To use another static server, point its root at `**web`** (dev) or `**dist**` (after build).

## Build (production static output)

```bash
npm run build
```

Runs `scripts/build-site.mjs`: reads `web/`, writes `**dist/**` with asset cache-busting, inlined FAQ JSON-LD on the homepage, generated `sitemap.xml`, and copies `robots.txt` plus `assets/`.

## Deployment

The site is **static** output in `**dist/**`. This repo targets **Firebase Hosting**; you can also publish `dist/` to any static host.

### 1. Prerequisites

- Node / npm (see **Conda environment** if you use the project env).
- `npm run build` writes `**dist/**`.

### 2. Other static hosts (optional)

Netlify, Vercel, Cloudflare Pages, etc.: **build command** `npm run build`, **publish directory** `dist`, then follow that provider’s custom-domain docs. This repository does not include provider-specific config files.

### 3. Firebase Hosting (CLI + deploy)

1. [Firebase Console](https://console.firebase.google.com/) — create or select a project.
2. `npm run firebase -- login` and `npm run firebase -- use --add` (select the project).
3. One-time: `npm run firebase -- init hosting` — public directory **`dist`**; do **not** overwrite this repo’s `firebase.json` if you want to keep its headers and ignore rules.
4. Deploy:
   ```bash
   npm run deploy:hosting
   ```
   (`npm run deploy` can include Firestore rules if you use them.)

### 4. Custom domain & DNS (industry-standard setup)

**Goals (same as this site’s HTML `rel="canonical"` and `sitemap.xml`):**

- **`https://medicina-familiar.co`** (apex) is the **canonical** hostname: it should answer **200** for the site.
- **`https://www.medicina-familiar.co`** should **301** to the apex (one host in Search Console/social copies; avoids duplicate content).

**Firebase Hosting (console)**

1. **Hosting** → your site → **Add custom domain** (or **Manage custom domains**).
2. Connect the **apex** `medicina-familiar.co` — finish the flow until status is **Connected** (DNS + SSL).
3. Connect **`www.medicina-familiar.co`** on the **same** Hosting site.
4. **Edit domain** for `www` → choose **Redirect this domain to another** → target **`medicina-familiar.co`** (hostname only, no `https://`).  
   For the **apex**, use **Serve traffic from this domain** (do **not** redirect the apex to `www`).

**Why not `redirects` in `firebase.json` for www→apex?**  
Hosting `redirects` match **path only**, not hostname. A rule that sends every path to `https://medicina-familiar.co/...` would run on **both** `www` and apex and can break canonical behavior. Hostname redirects belong in the **Firebase custom domain** UI (above).

**Registrar DNS (e.g. GoDaddy — DNS management)**

Add or keep records **exactly** as **Firebase Hosting** shows for each connected domain. Typical pattern:

| Type | Host / Name | Purpose |
|------|-------------|--------|
| **TXT** | `@` | Domain verification / ACME / ownership values Firebase specifies. Keep **`hosting-site=<your-site-id>`** if present. |
| **TXT** | `@` | Optional: Google Search Console / other verifications. |
| **A** | `@` | **Apex web traffic** — one or more IPv4 addresses Firebase lists (example often seen: `199.36.158.100`). Add **every** A row the console shows. |
| **AAAA** | `@` | Only if Firebase lists IPv6 for the apex. |
| **CNAME** | `www` | **Subdomain web traffic** — target **exactly** as Firebase shows (commonly `<your-site-id>.web.app`). |
| **MX** / other **TXT** | `@`, `_dmarc`, etc. | Email (GoDaddy / Workspace, SPF, DKIM, DMARC) — leave as required for mail; they are independent of the **A** records used for the website. |

**Registrar settings outside the DNS table**

- Turn **off** **domain forwarding / redirect** that sends the **naked domain** to **`www`** (or to a third-party URL). That conflicts with “apex is canonical” and with Firebase’s own **www → apex** redirect.

**Propagate, then verify**

- Changes can take minutes to several hours. After propagation, both domains should show **Connected** in Firebase.
- Quick checks:
  ```bash
  curl -sI "https://medicina-familiar.co/"  | head -5
  curl -sI "https://www.medicina-familiar.co/" | head -8
  ```
  Expect **200** on the apex and **301** with `location: https://medicina-familiar.co/...` on `www`. If results look wrong, use a private/incognito window or another network to rule out cached redirects.

**Search Console**

- Prefer a **Domain** property for `medicina-familiar.co` (covers `www` and apex). Submit **`sitemap.xml`** after deploy.

### 5. Blog (Firestore + `/blog` pages)

Static pages under **`web/blog/`** deploy to **`/blog/`**. The **admin UI** (`/blog/admin/`, tagged `noindex`) writes to Firestore so Angélica can compose and publish **without deploying**.

#### First-time setup

1. In Firebase Console → **Project settings** → **Your apps** → existing or new **Web app** → copy **`firebaseConfig`** into **`web/blog/assets/js/firebase-config.js`** (replace every `REPLACE_*` placeholder).
2. **Authentication** → enable **Email/Password** → create the publisher account(s).
3. Copy each user's **Authentication UID** into the **`isPublisher()`** allow-list in **`firebase/firestore.rules`**. Then run **`npm run deploy:firestore`** (deploys rules **and** the composite indexes from `firebase/firestore.indexes.json`).
4. Build and ship hosting (**`npm run build`** then **`npm run deploy:hosting`** — or **`npm run deploy`**). After that, new posts appear **immediately** from the DB; ordinary article edits do **not** require redeploy.

#### `posts` document shape

| Field | Purpose |
| ----- | ------- |
| `title` | Headline shown on the article and listings |
| `slug` | Must match the **document ID** (stable public URL slug) |
| `excerpt` | Optional teaser on the `/blog/` list |
| `bodyHtml` | Rich-text body (HTML stored as entered by authenticated publishers; only trusted editors have write access) |
| `published` | **`true`** = visible anonymously on the website |
| `publishedAt` | Set the **first time** `published` becomes true |
| `createdAt`, `updatedAt` | Metadata; admin list sorts by **`updatedAt` desc** |

Public queries only **`where('published','==', true)`**, which aligns with Firestore security rules.

#### Optional next steps

Add **Cloud Storage** for image uploads, **Cloud Functions** for validation, or an **`admin`** custom claim instead of UID lists in rules.

Deploy rules/indexes after changing them:

```bash
npm run deploy:firestore
```