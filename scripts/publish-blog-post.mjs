/**
 * Publish or update a blog post in Firestore (admin REST API).
 * Auth: Firebase CLI login token (~/.config/configstore/firebase-tools.json).
 *
 * Usage: node scripts/publish-blog-post.mjs <slug>
 *
 * Reads local drafts from blogs/<slug>/ (gitignored):
 *   post.json  — slug, title, excerpt, published
 *   body.html  — article HTML
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "dra-angelica-website";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://medicina-familiar.co";

function normalizeAssetUrl(url) {
  let src = String(url || "").trim();
  if (!src) return src;
  src = src.replace(new RegExp(`^${SITE_ORIGIN.replace(/\./g, "\\.")}(?=/)`), "");
  if (src === "/assets/images/blog-medico-familiar-consulta.jpg") {
    return "/assets/images/blog/blog-medico-familiar-consulta.jpg";
  }
  return src;
}

function normalizeBodyHtml(html) {
  return String(html || "").replace(
    /\bsrc=(["'])([^"']+)\1/gi,
    (_m, quote, src) => `src=${quote}${normalizeAssetUrl(src)}${quote}`,
  );
}

function extractCoverFromHtml(html) {
  const srcMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (!srcMatch) return null;
  const altMatch = html.match(/<img\b[^>]*\balt=["']([^"']*)["']/i);
  return { url: normalizeAssetUrl(srcMatch[1]), alt: altMatch?.[1] || "" };
}

const slugArg = process.argv[2]?.trim();
if (!slugArg) {
  console.error("Usage: node scripts/publish-blog-post.mjs <slug>");
  console.error("Expects blogs/<slug>/post.json and blogs/<slug>/body.html");
  process.exit(1);
}

const postDir = join(root, "blogs", slugArg);
const metaPath = join(postDir, "post.json");
const bodyPath = join(postDir, "body.html");

if (!existsSync(metaPath) || !existsSync(bodyPath)) {
  console.error(`Missing draft files under blogs/${slugArg}/`);
  console.error("Copy blogs.example/ to blogs/ and edit, or create post.json + body.html.");
  process.exit(1);
}

/** @type {{ slug?: string; title?: string; excerpt?: string; published?: boolean; coverImageUrl?: string; coverImageAlt?: string }} */
const meta = JSON.parse(readFileSync(metaPath, "utf8"));
const bodyHtml = normalizeBodyHtml(readFileSync(bodyPath, "utf8").trim());

const slug = String(meta.slug || slugArg).trim();
const title = String(meta.title || "").trim();
const excerpt = String(meta.excerpt || "").trim();
const published = meta.published !== false;

let coverImageUrl = normalizeAssetUrl(meta.coverImageUrl || "");
let coverImageAlt = String(meta.coverImageAlt || "").trim();
if (!coverImageUrl) {
  const extracted = extractCoverFromHtml(bodyHtml);
  if (extracted) {
    coverImageUrl = extracted.url;
    coverImageAlt = coverImageAlt || extracted.alt;
  }
}

if (!title) {
  console.error("post.json: title is required.");
  process.exit(1);
}
if (!bodyHtml) {
  console.error("body.html is empty.");
  process.exit(1);
}
if (slug !== slugArg) {
  console.error(`post.json slug "${slug}" does not match folder "${slugArg}".`);
  process.exit(1);
}

const FIREBASE_CLI_CLIENT_ID =
  "563584335869-fgrrgmhks46de2o44fbnke5683f9q878.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = "j9PUMcr2L77Moriyu8TV";

function firebaseConfigPath() {
  return join(homedir(), ".config/configstore/firebase-tools.json");
}

/** @type {string | null} */
let cachedAccessToken = null;

async function firebaseAccessToken() {
  if (process.env.FIREBASE_TOKEN) {
    return process.env.FIREBASE_TOKEN;
  }

  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  const cfgPath = firebaseConfigPath();
  if (!existsSync(cfgPath)) {
    throw new Error(
      "Firebase CLI not logged in. Run: firebase login\n" +
        "Or set FIREBASE_TOKEN from: firebase login:ci",
    );
  }

  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const tokens = cfg.tokens ?? {};
  const { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt } = tokens;

  const stillValid = accessToken && expiresAt && Date.now() < expiresAt - 60_000;
  if (stillValid) {
    cachedAccessToken = accessToken;
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error(
      "Firebase CLI session expired (no refresh token). Run: firebase login --reauth",
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Firebase CLI session expired (${res.status}). Run: firebase login --reauth`,
    );
  }

  const data = await res.json();
  cfg.tokens = {
    ...tokens,
    access_token: data.access_token,
    expires_in: data.expires_in,
    expires_at: Date.now() + data.expires_in * 1000,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
  };
  writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  cachedAccessToken = data.access_token;
  return data.access_token;
}

function fieldString(value) {
  return { stringValue: value };
}

function fieldBool(value) {
  return { booleanValue: value };
}

function fieldTimestamp(iso) {
  return { timestampValue: iso };
}

async function getDoc(docSlug) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${docSlug}`;
  const token = await firebaseAccessToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchDoc(docSlug, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${docSlug}?updateMask.fieldPaths=${Object.keys(fields).map(encodeURIComponent).join("&updateMask.fieldPaths=")}`;
  const token = await firebaseAccessToken();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const now = new Date().toISOString();
const existing = await getDoc(slug);

/** @type {Record<string, unknown>} */
const fields = {
  title: fieldString(title),
  slug: fieldString(slug),
  excerpt: fieldString(excerpt),
  bodyHtml: fieldString(bodyHtml),
  published: fieldBool(published),
  updatedAt: fieldTimestamp(now),
};

if (coverImageUrl) {
  fields.coverImageUrl = fieldString(coverImageUrl);
  fields.coverImageAlt = fieldString(coverImageAlt || title);
}

if (!existing) {
  fields.createdAt = fieldTimestamp(now);
  if (published) fields.publishedAt = fieldTimestamp(now);
} else if (published && !existing.fields?.published?.booleanValue) {
  fields.publishedAt = fieldTimestamp(now);
}

const result = await patchDoc(slug, fields);
console.log("Published:", result.name);
console.log("URL: https://medicina-familiar.co/blog/articulo?slug=" + slug);

await writeBlogPostsManifest();
console.log("Updated: web/assets/data/blog-posts.json");

function firestoreValue(field) {
  if (field.stringValue != null) return field.stringValue;
  if (field.timestampValue != null) return field.timestampValue;
  if (field.booleanValue != null) return field.booleanValue;
  return null;
}

async function listPublishedPosts() {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const token = await firebaseAccessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "posts" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "published" },
            op: "EQUAL",
            value: { booleanValue: true },
          },
        },
        orderBy: [{ field: { fieldPath: "publishedAt" }, direction: "DESCENDING" }],
      },
    }),
  });
  if (!res.ok) throw new Error(`runQuery failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  const posts = [];
  for (const row of rows) {
    const doc = row.document;
    if (!doc?.name) continue;
    const docSlug = doc.name.split("/").pop();
    const f = doc.fields ?? {};
    posts.push({
      slug: docSlug,
      title: firestoreValue(f.title) || "",
      excerpt: firestoreValue(f.excerpt) || "",
      publishedAt: firestoreValue(f.publishedAt) || "",
      coverImageUrl: firestoreValue(f.coverImageUrl) || "",
      coverImageAlt: firestoreValue(f.coverImageAlt) || "",
    });
  }
  return posts;
}

async function writeBlogPostsManifest() {
  const posts = await listPublishedPosts();
  const outDir = join(root, "web", "assets", "data");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "blog-posts.json"), `${JSON.stringify({ posts }, null, 2)}\n`, "utf8");
}
