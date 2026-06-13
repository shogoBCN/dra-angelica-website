import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

/** HTML entry points: all processed with asset cache-bust; only index gets inline JSON-LD. */
const HTML_PAGES = ["index.html"];

const SITEMAP_URLS = [
  { loc: "https://medicina-familiar.co/", priority: "1.0", changefreq: "monthly" },
  { loc: "https://medicina-familiar.co/cita/", priority: "0.85", changefreq: "monthly" },
  {
    loc: "https://medicina-familiar.co/blog/articulo?slug=medicina-familiar-en-colombia",
    priority: "0.75",
    changefreq: "monthly",
  },
  { loc: "https://medicina-familiar.co/blog/", priority: "0.7", changefreq: "weekly" },
];

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

await cp(join(src, "cita"), join(dist, "cita"), { recursive: true });
for (const htmlPath of await walkHtmlFiles(join(dist, "cita"))) {
  let html = await readFile(htmlPath, "utf8");
  html = applyAssetCacheBust(html, buildId);
  html = injectAssetVersion(html, buildId);
  await writeFile(htmlPath, html, "utf8");
}

const lastmod = new Date().toISOString().slice(0, 10);
const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_URLS.map(
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
  `build-site: wrote dist/ (cache-bust v=${buildId}, pages=${HTML_PAGES.join(", ")}, blog/, cita/)`
);
