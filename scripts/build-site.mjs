import { cp, mkdir, rm, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web");
const dist = join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(join(src, "index.html"), join(dist, "index.html"));
await cp(join(src, "assets"), join(dist, "assets"), { recursive: true });
