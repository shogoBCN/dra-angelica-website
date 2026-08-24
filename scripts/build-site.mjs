import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

/** HTML entry points: all processed with asset cache-bust; only index gets inline JSON-LD. */
const HTML_PAGES = ["index.html"];

/** Google Ads campaign landings under web/campana/<slug>/ (e.g. campana/un-solo-plan). */
const CAMPAIGN_LANDING_DIRS = ["campana/un-solo-plan"];

const SITEMAP_STATIC_URLS = [
  { loc: "https://medicina-familiar.co/", priority: "1.0", changefreq: "monthly" },
  { loc: "https://medicina-familiar.co/cita/", priority: "0.85", changefreq: "monthly" },
  ...CAMPAIGN_LANDING_DIRS.map((slug) => ({
    loc: `https://medicina-familiar.co/${slug}/`,
    priority: "0.85",
    changefreq: "monthly",
  })),
  { loc: "https://medicina-familiar.co/blog/", priority: "0.7", changefreq: "weekly" },
];

const SITE_ORIGIN = "https://medicina-familiar.co";

function escapeHtmlAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function truncateMeta(s, max = 155) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function normalizeCoverPath(url) {
  let src = String(url || "").trim();
  if (!src) return "";
  src = src.replace(/^https:\/\/medicina-familiar\.co(?=\/)/i, "");
  if (src === "/assets/images/blog-medico-familiar-consulta.jpg") {
    return "/assets/images/blog/blog-medico-familiar-consulta.jpg";
  }
  return src.split("?")[0];
}

function extractCoverFromBodyHtml(html) {
  const srcMatch = String(html || "").match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return srcMatch ? normalizeCoverPath(srcMatch[1]) : "";
}

async function resolvePostShareImage(post) {
  let path = normalizeCoverPath(post.shareImageUrl);
  if (!path) {
    const bodyPath = join(root, "blogs", post.slug, "body.html");
    if (existsSync(bodyPath)) {
      const body = await readFile(bodyPath, "utf8");
      path = extractCoverFromBodyHtml(body);
    }
  }
  return path ? `${SITE_ORIGIN}${path}` : "";
}

function replaceMetaContent(html, id, newContent) {
  const escaped = escapeHtmlAttr(newContent);
  const re = new RegExp(`(<meta id="${id}"[^>]*content=")[^"]*(")`, "i");
  if (!re.test(html)) {
    throw new Error(`build-site: missing <meta id="${id}"> in articulo.html`);
  }
  return html.replace(re, `$1${escaped}$2`);
}

function applyBlogArticleMeta(html, post, coverAbs) {
  const slug = String(post.slug || "").trim();
  const title = escapeHtmlAttr(post.title || "Artículo");
  const excerpt = escapeHtmlAttr(truncateMeta(post.excerpt));
  const pageUrl = `${SITE_ORIGIN}/blog/articulo/${slug}/`;
  const coverAlt = escapeHtmlAttr(post.shareImageAlt || post.coverImageAlt || post.title || "");

  let out = html;
  out = out.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title} | Blog — Dra. Angélica Granados Silva</title>`,
  );
  out = replaceMetaContent(out, "blog-meta-desc", excerpt);
  out = out.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${pageUrl}" />`);
  out = replaceMetaContent(out, "og-title", post.title || "Artículo");
  out = replaceMetaContent(out, "og-description", truncateMeta(post.excerpt));
  out = replaceMetaContent(out, "og-url", pageUrl);
  out = replaceMetaContent(out, "twitter-title", post.title || "Artículo");
  out = replaceMetaContent(out, "twitter-description", truncateMeta(post.excerpt));
  if (coverAbs) {
    out = replaceMetaContent(out, "og-image", coverAbs);
    out = replaceMetaContent(out, "twitter-image", coverAbs);
    out = replaceMetaContent(out, "og-image-alt", coverAlt);
  }
  return out;
}

async function generateBlogArticlePages(distBlogDir) {
  const manifestPath = join(src, "assets", "data", "blog-posts.json");
  let posts = [];
  try {
    const raw = await readFile(manifestPath, "utf8");
    posts = JSON.parse(raw)?.posts ?? [];
  } catch {
    return;
  }
  if (!posts.length) return;

  const templatePath = join(src, "blog", "articulo.html");
  const template = await readFile(templatePath, "utf8");

  for (const post of posts) {
    if (!post?.slug) continue;
    const shareAbs = await resolvePostShareImage(post);
    if (!shareAbs) {
      console.warn(`build-site: post "${post.slug}" has no article image for social preview`);
    }
    const html = applyBlogArticleMeta(template, post, shareAbs);
    const outDir = join(distBlogDir, "articulo", post.slug);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, "index.html"), html, "utf8");
  }
}

async function loadBlogSitemapUrls() {
  const manifestPath = join(src, "assets", "data", "blog-posts.json");
  try {
    const raw = await readFile(manifestPath, "utf8");
    const data = JSON.parse(raw);
    const posts = Array.isArray(data?.posts) ? data.posts : [];
    return posts
      .filter((post) => post?.slug)
      .map((post) => ({
        loc: `https://medicina-familiar.co/blog/articulo/${post.slug}/`,
        priority: "0.75",
        changefreq: "monthly",
      }));
  } catch {
    return [];
  }
}

/** Walk subtree and collect *.html paths. */
async function walkHtmlFiles(dir, acc = []) {
  let ents;
  try {
    ents = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of ents) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) await walkHtmlFiles(p, acc);
    else if (ent.name.endsWith(".html")) acc.push(p);
  }
  return acc;
}

/** Unique per deploy so asset URLs change and browsers fetch fresh CSS/JS/images. */
function makeBuildId() {
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 32);
  for (const key of ["GITHUB_SHA", "COMMIT_REF", "CF_PAGES_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA"]) {
    const v = process.env[key];
    if (v && v.length >= 7) return v.slice(0, 12);
  }
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

function applyAssetCacheBust(html, buildId) {
  /** Blog bundle must stay under `/blog/assets/` so it never collides with site `/assets/`. */
  return html
    .replace(
      /\b(href|src)="(\/blog\/assets\/[^"?#]+)"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${buildId}"`
    )
    .replace(
      /\b(href|src)="(\/assets\/[^"?#]+)"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${buildId}"`
    )
    .replace(
      /\b(href|src)="((?:\.\.\/)*assets\/[^"?#]+)"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${buildId}"`
    );
}

/** Lets JS bust JSON fetches; pairs with assetCacheQuery() in site scripts. */
function injectAssetVersion(html, buildId) {
  const meta = `    <meta name="site-version" content="${buildId}" />\n`;
  if (!html.includes('name="site-version"')) {
    html = html.replace(/<head>\s*\n/, `<head>\n${meta}`);
  }
  return html.replace(/<body([^>]*)>/, (match, attrs) => {
    if (/data-asset-version=/.test(attrs)) return match;
    return `<body data-asset-version="${buildId}"${attrs}>`;
  });
}

/** ES module relative imports must carry the same ?v= as entry scripts (immutable JS caching). */
function applyJsModuleCacheBust(jsSource, buildId) {
  return jsSource.replace(
    /(from\s+["'])(\.\/[^"'?#]+\.js)(["'])/g,
    (_m, prefix, modulePath, suffix) => `${prefix}${modulePath}?v=${buildId}${suffix}`
  );
}

async function processAnalyticsModuleImports(distAssetsDir, buildId) {
  const analyticsDir = join(distAssetsDir, "analytics");
  let entries;
  try {
    entries = await readdir(analyticsDir);
  } catch {
    return;
  }
  for (const entryName of entries) {
    if (!entryName.endsWith(".js")) continue;
    const filePath = join(analyticsDir, entryName);
    const source = await readFile(filePath, "utf8");
    await writeFile(filePath, applyJsModuleCacheBust(source, buildId), "utf8");
  }
}

async function injectInlineJsonLd(html) {
  const schemaRaw = await readFile(join(src, "assets/seo/schema.json"), "utf8");
  const schemaInline = JSON.stringify(JSON.parse(schemaRaw)).replace(/</g, "\\u003c");
  const ldJsonScriptRe =
    /<script type="application\/ld\+json" src="assets\/seo\/schema\.json(?:\?v=[^"]*)?"><\/script>/;
  if (!ldJsonScriptRe.test(html)) {
    throw new Error(
      'build-site: index.html must contain: <script type="application/ld+json" src="assets/seo/schema.json"></script>'
    );
  }
  return html.replace(ldJsonScriptRe, `<script type="application/ld+json">${schemaInline}</script>`);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const buildId = makeBuildId();

for (const page of HTML_PAGES) {
  const pagePath = join(src, page);
  let html = await readFile(pagePath, "utf8");
  html = applyAssetCacheBust(html, buildId);
  html = injectAssetVersion(html, buildId);
  if (page === "index.html") {
    html = await injectInlineJsonLd(html);
  }
  await writeFile(join(dist, page), html, "utf8");
}

await cp(join(src, "robots.txt"), join(dist, "robots.txt"));
await cp(join(src, "assets"), join(dist, "assets"), { recursive: true });
await processAnalyticsModuleImports(join(dist, "assets"), buildId);

await cp(join(src, "blog"), join(dist, "blog"), { recursive: true });
for (const htmlPath of await walkHtmlFiles(join(dist, "blog"))) {
  let html = await readFile(htmlPath, "utf8");
  html = applyAssetCacheBust(html, buildId);
  html = injectAssetVersion(html, buildId);
  await writeFile(htmlPath, html, "utf8");
}
await generateBlogArticlePages(join(dist, "blog"));

const legacyArticleShell = join(dist, "blog", "articulo.html");
try {
  await rm(legacyArticleShell);
} catch {
  /* already absent */
}

await cp(join(src, "cita"), join(dist, "cita"), { recursive: true });
for (const htmlPath of await walkHtmlFiles(join(dist, "cita"))) {
  let html = await readFile(htmlPath, "utf8");
  html = applyAssetCacheBust(html, buildId);
  html = injectAssetVersion(html, buildId);
  await writeFile(htmlPath, html, "utf8");
}

for (const slug of CAMPAIGN_LANDING_DIRS) {
  const srcDir = join(src, slug);
  const distDir = join(dist, slug);
  await cp(srcDir, distDir, { recursive: true });
  for (const htmlPath of await walkHtmlFiles(distDir)) {
    let html = await readFile(htmlPath, "utf8");
    html = applyAssetCacheBust(html, buildId);
    html = injectAssetVersion(html, buildId);
    await writeFile(htmlPath, html, "utf8");
  }
}

const lastmod = new Date().toISOString().slice(0, 10);
const sitemapUrls = [...SITEMAP_STATIC_URLS, ...(await loadBlogSitemapUrls())];
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(
  (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
).join("\n")}
</urlset>
`;
await writeFile(join(dist, "sitemap.xml"), sitemapXml, "utf8");

console.info(
  `build-site: wrote dist/ (cache-bust v=${buildId}, pages=${HTML_PAGES.join(", ")}, blog/, cita/, ${CAMPAIGN_LANDING_DIRS.join(", ")}/)`
);
