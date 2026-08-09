/**
 * Build downloadable PDFs for the website from source PNGs in infographics/ (gitignored).
 *
 * Usage: node scripts/build-infographic-pdf.mjs
 *
 * Requires macOS `sips` or ImageMagick `magick`/`convert` on PATH.
 */
import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const infographicsDir = join(root, "infographics");
const downloadsDir = join(root, "web", "assets", "downloads");

const INFOGRAPHICS = [
  {
    source: "mide-tu-presion-en-casa-angelica.png",
    output: "mide-tu-presion-en-casa.pdf",
  },
];

function hasCommand(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  return spawnSync(probe, [cmd], { stdio: "ignore" }).status === 0;
}

function convertWithSips(pngPath, pdfPath) {
  const result = spawnSync("sips", ["-s", "format", "pdf", pngPath, "--out", pdfPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "sips failed");
  }
}

function convertWithMagick(pngPath, pdfPath) {
  const cmd = hasCommand("magick") ? "magick" : "convert";
  const result = spawnSync(cmd, [pngPath, pdfPath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `${cmd} failed`);
  }
}

function convertPngToPdf(pngPath, pdfPath) {
  if (process.platform === "darwin" && hasCommand("sips")) {
    convertWithSips(pngPath, pdfPath);
    return "sips";
  }
  if (hasCommand("magick") || hasCommand("convert")) {
    convertWithMagick(pngPath, pdfPath);
    return hasCommand("magick") ? "magick" : "convert";
  }
  throw new Error("No PNG→PDF tool found (need macOS sips or ImageMagick magick/convert)");
}

await mkdir(downloadsDir, { recursive: true });

let built = 0;
let skipped = 0;

for (const { source, output } of INFOGRAPHICS) {
  const pngPath = join(infographicsDir, source);
  const pdfPath = join(downloadsDir, output);

  if (!existsSync(pngPath)) {
    if (existsSync(pdfPath)) {
      console.warn(`build-infographic-pdf: skip ${output} (missing source ${source}, keeping existing PDF)`);
      skipped += 1;
      continue;
    }
    console.warn(`build-infographic-pdf: skip ${output} (missing source ${source})`);
    skipped += 1;
    continue;
  }

  try {
    const tool = convertPngToPdf(pngPath, pdfPath);
    const { size } = await stat(pdfPath);
    console.info(`build-infographic-pdf: ${output} (${Math.round(size / 1024)} KB via ${tool})`);
    built += 1;
  } catch (err) {
    if (existsSync(pdfPath)) {
      console.warn(`build-infographic-pdf: could not rebuild ${output} — ${err.message}; keeping existing PDF`);
      skipped += 1;
      continue;
    }
    throw err;
  }
}

console.info(`build-infographic-pdf: done (${built} built, ${skipped} skipped)`);
