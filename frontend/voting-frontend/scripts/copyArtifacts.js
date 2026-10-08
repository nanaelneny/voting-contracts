// Copies the zero-knowledge proving files into public/semaphore so the browser can
// load them from this app instead of downloading them from the internet during a vote.
// Depths 1-16 cover elections of up to 65,536 voters.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const source = path.dirname(require.resolve("@zk-kit/semaphore-artifacts/package.json"));
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "semaphore");

fs.mkdirSync(target, { recursive: true });
let copied = 0;
for (let depth = 1; depth <= 16; depth++) {
  for (const ext of ["wasm", "zkey"]) {
    const name = `semaphore-${depth}.${ext}`;
    const dest = path.join(target, name);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(source, name), dest);
      copied++;
    }
  }
}
if (copied) console.log(`Copied ${copied} proving files to public/semaphore`);
