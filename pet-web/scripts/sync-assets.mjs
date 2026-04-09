/**
 * 将仓库根目录 assets/argenti 同步到 pet-web/public/argenti（Vite 静态资源）。
 * Spine 需要：JSON（非 _ske）、atlas、与 atlas 同名的 png。
 */
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const src = join(repoRoot, "assets", "argenti");
const dest = join(__dirname, "..", "public", "argenti");

if (!existsSync(src)) {
  console.error("缺少源目录:", src);
  process.exit(1);
}
mkdirSync(join(__dirname, "..", "public"), { recursive: true });
cpSync(src, dest, { recursive: true, force: true });
console.log("synced", src, "->", dest);
