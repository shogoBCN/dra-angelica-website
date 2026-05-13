# Dra. Angélica — website

Static **frontend** (visitor-facing copy in **Colombian Spanish**) and **Firebase** (Hosting + optional Firestore for blog posts). **Repository and technical docs are in English;** only the on-screen content under `web/` is Spanish (`lang="es-CO"`).

## Repository layout


| Path            | Purpose                                                        |
| --------------- | -------------------------------------------------------------- |
| `web/`          | Site **source**: `index.html`, `assets/css/`, `assets/js/`     |
| `dist/`         | **Build output** (generated; do not edit). Deploy this folder. |
| `scripts/`      | Build tooling (`build-site.mjs`)                               |
| `firebase/`     | `firestore.rules`, `firestore.indexes.json`                    |
| `firebase.json` | Firebase Hosting + Firestore paths, security **headers**       |


## Security notes

- **Secrets:** do not commit `.env`, service account JSON, or private keys. `.gitignore` lists common patterns; use `firebase functions:config:set` or Secret Manager for real secrets later.
- **Firestore:** rules live in `firebase/firestore.rules` (default deny outside `posts/`).
- **Hosting:** response headers (HSTS, CSP, `X-Frame-Options`, etc.) are set in `firebase.json`. If you load the Firebase SDK from `gstatic.com` or add inline scripts, you must **relax or extend** the `Content-Security-Policy` there.

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

Copies `**web/**` → `**dist/**` (static assets only).

## Deployment (e.g. domain at GoDaddy)

The site is **static** `dist/` output. Point DNS at your host (this project is set up for **Firebase Hosting**; you can also upload `dist/` anywhere that serves static files).

### 1. Prerequisites

- Git repository (e.g. on GitHub), or upload `dist/` where your host allows it.
- `npm run build` produces `**dist/`** as above.

### 2. Other static hosts (optional)

You can deploy `**dist/**` to Netlify, Vercel, or Cloudflare Pages: **build command** `npm run build`, **publish directory** `dist`, then follow that provider’s custom-domain steps. This repo does not ship provider-specific config files for those.

### 3. Google Cloud (Firebase) — primary path

**A) Firebase Hosting** (HTTPS and custom domain in the Firebase console)

1. Create or pick a project in the [Firebase Console](https://console.firebase.google.com/).
2. Activate Conda and install JS deps (see **Conda environment** above), then run `npm run firebase -- login`.
3. From the repo root (once): `npm run firebase -- init hosting` — select the project; **do not overwrite** `firebase.json` if you keep the one from this repo; set the public directory to `**dist`**.
4. Build and deploy:
  ```bash
   npm run deploy:hosting
  ```
5. In Firebase: **Hosting** → **Add custom domain** and add the DNS records they show (same idea as step 5 below).

**B) Cloud Storage** (bucket + static website)

- Upload `**dist/`** contents, enable **static website hosting** (`index.html` as main page).
- **HTTPS + apex domain** usually needs a load balancer + certificate; more work than Firebase Hosting.

**C) Cloud Run**

- Optional if you later serve **dynamic** APIs from GCP; not required for this static site.

### 4. GoDaddy DNS → your host

In GoDaddy: **My Products** → your domain → **DNS** / **Manage DNS**.

- `**www`:** add a **CNAME** as your host instructs (Firebase, Netlify, etc. each show the exact target).
- **Apex (`@`):** often **A** records or **ALIAS/ANAME**; follow the host’s custom-domain docs.
- Wait for DNS propagation (minutes to hours). **HTTPS** is handled by the host (e.g. Firebase provisions certificates).

### 5. Blog posts (Firestore)

Firebase fits a small blog: **Firestore** for `posts`, **Authentication** for publishers, **rules** in `firebase/firestore.rules`.


| Piece              | Role                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Firestore**      | `posts` documents (`title`, `body`, `published`, `publishedAt`, `slug`, …).             |
| **Authentication** | Publisher accounts; **writes** restricted in rules.                                     |
| **Security rules** | Public **read** when `published == true`; list queries must filter `published == true`. |
| **Hosting**        | `npm run deploy` or `npm run deploy:hosting`.                                           |


Optional later: **Cloud Functions** for admin claims or validation.

Deploy rules after editing:

```bash
npm run deploy:firestore
```

(Or `npm run deploy` for hosting + Firestore config.)