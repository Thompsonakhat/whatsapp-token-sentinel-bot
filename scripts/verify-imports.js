import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "src");
const importRe = /from\s+["'](\.{1,2}\/[^"']+)["']|import\(["'](\.{1,2}\/[^"']+)["']\)/g;
let failed = false;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

for (const file of walk(src)) {
  const code = fs.readFileSync(file, "utf8");
  for (const match of code.matchAll(importRe)) {
    const spec = match[1] || match[2];
    const resolved = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(resolved)) {
      console.error(`Missing import in ${path.relative(root, file)}: ${spec}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("import verification ok");
