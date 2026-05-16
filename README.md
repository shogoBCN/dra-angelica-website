# Dra. Angélica — website

Static **frontend** (visitor-facing copy in **Colombian Spanish**) and **Firebase** (Hosting + optional Firestore for blog posts). **Repository and technical docs are in English;** only the on-screen content under `web/` is Spanish (`lang="es-CO"`).

## Repository layout


| Path            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `web/`          | Site **source**: `index.html`, **`blog/`** subtree, shared **`assets/`** |
| `dist/`         | **Build output** (generated; do not edit). Deploy this folder. |
| `scripts/`      | Build tooling (`build-site.mjs`)                               |
| `firebase/`     | `firestore.rules`, `firestore.indexes.json`                    |
| `firebase.json` | Firebase Hosting + Firestore paths, security **headers**       |


## Security notes

- **Secrets:** do not commit `.env`, service account JSON, or private keys. `.gitignore` lists common patterns; use `firebase functions:config:set` or Secret Manager for real secrets later.
- **Firestore:** rules live in `firebase/firestore.rules` (default deny outside `posts/`).
- **Hosting:** `firebase.json` sets security headers (HSTS, `X-Frame-Options`, `Referrer-Policy`, etc.). **Content-Security-Policy** lives in **`web/index.html`** and per-page on **`web/blog/**/*.html`** (Firebase SDK CDN, and jsDelivr for Quill on `/blog/admin`). (`frame-ancestors` belongs in a **response header**, not meta.)

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

The document root **must be `web/`** (same layout as Hosting’s `dist/` after `npm run build`). **`/blog/**` URLs must literally start with `/blog/`** — if you serve only the `blog` subfolder at the site root (`/admin/` instead of `/blog/admin/`), relative URLs break because “blog-owned” scripts live under **`/blog/assets/…`**, not **`/assets/…`**.

If you still see **`404` on `/blog/assets/`**, you are pointing the static server at the wrong folder. Use **`npx serve web`** (or **`npx serve dist`** after a build).

Blog templates load **`/blog/assets/`** for Firebase + blog bundles and **`/assets/`** for the shared stylesheet and `main.js`, so **`main.js`** is always **`/assets/js/main.js`** and **`firebase-config`** is **`/blog/assets/js/firebase-config.js`**.

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

#### Tutorial: Firestore from scratch (nothing configured yet)

Do these in the **same Firebase project** as **`firebase-config.js`** and **`.firebaserc`**.

##### 1. Create Firestore Database (Firebase Console only)

1. Open **[Firebase Console](https://console.firebase.google.com/)** → choose your project.
2. Sidebar **Build** → **Firestore Database**.
3. **Create database**.
4. Choose **production mode** (you will publish strict rules from this repo right after; avoid leaving “wide open” rules in production longer than testing).
5. Pick a **location** Firebase offers (often **`southamerica-east1`** (São Paulo) is a reasonable default for Colombian traffic; **cannot be changed later** — read the picker text carefully).
6. **Enable**.

The database starts **empty**. You will **not** create `posts` by hand—the admin UI writes them.

##### 2. Enable Authentication (sign-in)

1. **Build** → **Authentication** → **Get started**.
2. **Sign-in method** → **Email/Password** → **Enable** → **Save**.
3. **Users** → **Add user** with the editorial email/password.
4. Click that user → copy **UID** → put it inside **`firebase/firestore.rules`** in the **`isPublisher()`** array (with the repo’s comma-separated UID list syntax).

Firestore rules deploy does **not** create users—you must complete this step once.

##### 3. Deploy rules + indexes from the repository

From **this repo root** (Node installed):

```bash
npm install
npm run firebase -- login                    # browser auth, once per machine
npm run firebase -- use --add                # choose dra-angelica-website
npm run deploy:firestore
```

That command publishes **`firebase/firestore.rules`** and **`firebase/firestore.indexes.json`**. Visitors may only read **`posts`** where **`published == true`**; **`isPublisher()`** UIDs may read/write all **`posts`**.

Until the composite index (**`published` + `publishedAt`**) finishes building, the **`/blog/`** list query may temporarily fail—in the Console → Firestore → **Indexes**, watch until it turns green.

##### 4. Hosting + Firebase web config + first post

1. Paste **`firebaseConfig`** from Firebase → **Project settings** → Web app → into **`web/blog/assets/js/firebase-config.js`**.
2. **`npm run build`** then **`npm run deploy:hosting`** (or **`npm run deploy`** to ship Firestore config + hosting together sometimes).
3. Open **`…/blog/admin/`** → sign in → write a post → check **Publish** → **Save**.
4. **Firestore → Data**: you should see collection **`posts`**, document ID = **slug**.

If signing in hits **`API key not valid`**, fix the **Google Cloud Browser key** restrictions (see **Troubleshooting admin login** below).

##### 5. You do **not** need to “create the `posts` collection” yourself

Firestore creates the **`posts`** collection automatically when the first document is saved. No manual seed is required unless you prefer it.

---

#### Compact checklist

| Step | Where | What |
| --- | --- | --- |
| 1 | Console | Create **Firestore Database** (step 1 above) |
| 2 | Console | **Authentication**: Email/password + user; UID copied into **`isPublisher()`** in repo rules |
| 3 | Laptop | **`npm run deploy:firestore`** |
| 4 | Repo | **`firebase-config.js`** filled |
| 5 | Laptop | **`npm run build`** && **`npm run deploy:hosting`** |
| 6 | Browser | **`/blog/admin`** → first article → verify in **Firestore → Data** |

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

#### Troubleshooting admin login (`/blog/admin`)

- **Browser console CSP + `.map` files:** DevTools may try to fetch **source maps** (`firebase-*.js.map`, Quill `.map`). That uses **`connect-src`**. Blog pages allow **`https://www.gstatic.com`** and **`https://cdn.jsdelivr.net`** for those fetches so the warnings go away; blocking maps does **not** break Auth or saving.
- **`auth/api-key-not-valid`** / **`auth/invalid-api-key`:** Google's Identity Toolkit is rejecting your **Browser API key**. This is unrelated to CSP. In **Google Cloud Console** → **APIs & Services** → **Credentials**, open your project’s browser key (same `apiKey` as in **`firebase-config.js`**).
  - **Application restrictions:** If **HTTP referrers** is enabled, **every origin you use must match**, including **`localhost` vs `127.0.0.1`** and the **exact port** (e.g. `http://127.0.0.1:5500`). Or set restrictions to **None** briefly to confirm that was the cause.
  - **API restrictions:** If the key uses **Restrict key**, the allow-list must include **Identity Toolkit API** (and usually **Token Service API** / Firebase-related APIs). If that list was edited and dropped Identity Toolkit, sign-in returns **400** / **API key not valid**. For a quick check, choose **Don't restrict key** on that credential, verify login works, then narrow again deliberately.

#### Optional next steps

Add **Cloud Storage** for image uploads, **Cloud Functions** for validation, or an **`admin`** custom claim instead of UID lists in rules.

Deploy rules/indexes after changing them:

```bash
npm run deploy:firestore
```