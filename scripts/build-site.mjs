import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

/** Unique per deploy so asset URLs change and browsers fetch fresh CSS/JS/images. */
function makeBuildId() {
  if (process.env.BUILD_ID) return String(process.env.BUILD_ID).slice(0, 32);
  for (const key of ["GITHUB_SHA", "COMMIT_REF", "CF_PAGES_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA"]) {
    const v = process.env[key];
    if (v && v.length >= 7) return v.slice(0, 12);
  }
  return createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const buildId = makeBuildId();
let html = await readFile(join(src, "index.html"), "utf8");
html = html.replace(/\b(href|src)="(assets\/[^"?#]+)"/g, (_m, attr, assetPath) => {
  return `${attr}="${assetPath}?v=${buildId}"`;
});
await writeFile(join(dist, "index.html"), html, "utf8");

await cp(join(src, "assets"), join(dist, "assets"), { recursive: true });

console.info(`build-site: wrote dist/ (cache-bust v=${buildId})`);
