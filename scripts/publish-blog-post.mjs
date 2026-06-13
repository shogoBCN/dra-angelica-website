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
const bodyHtml = readFileSync(bodyPath, "utf8").trim();

const slug = String(meta.slug || slugArg).trim();
const title = String(meta.title || "").trim();
const excerpt = String(meta.excerpt || "").trim();
const published = meta.published !== false;

function extractCoverFromHtml(html) {
  const srcMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  if (!srcMatch) return null;
  const altMatch = html.match(/<img\b[^>]*\balt=["']([^"']*)["']/i);
  return { url: srcMatch[1], alt: altMatch?.[1] || "" };
}

let coverImageUrl = String(meta.coverImageUrl || "").trim();
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

function firebaseAccessToken() {
  const cfgPath = join(homedir(), ".config/configstore/firebase-tools.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const { access_token: token, expires_at: expiresAt } = cfg.tokens ?? {};
  if (!token || Date.now() > expiresAt) {
    throw new Error("Firebase CLI token missing or expired. Run: firebase login");
  }
  return token;
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
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${firebaseAccessToken()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchDoc(docSlug, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${docSlug}?updateMask.fieldPaths=${Object.keys(fields).map(encodeURIComponent).join("&updateMask.fieldPaths=")}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${firebaseAccessToken()}`,
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
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firebaseAccessToken()}`,
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
