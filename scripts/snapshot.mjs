// Fetch a URL and store its bytes, extracted text, and metadata with a SHA-256 hash.
// The text comes from the shared extractor, so the loader can re-derive and check it.
// Usage: node scripts/snapshot.mjs <id> <url> [outDir]
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText } from "../packages/core/src/extract.ts";

const [id, url, outDir = "spikes/s2/out"] = process.argv.slice(2);
if (!id || !url) {
  console.error("Usage: node scripts/snapshot.mjs <id> <url> [outDir]");
  process.exit(2);
}

const res = await fetch(url, { headers: { "user-agent": "changeling-kit-snapshot/0.0" } });
const bytes = Buffer.from(await res.arrayBuffer());
const sha256 = createHash("sha256").update(bytes).digest("hex");
const text = extractText(bytes);

const dir = join(outDir, id);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "original.bin"), bytes);
if (text !== null) await writeFile(join(dir, "extracted.txt"), text, "utf8");
const meta = {
  id,
  url,
  finalUrl: res.url,
  status: res.status,
  contentType: res.headers.get("content-type") ?? "",
  retrievedAt: new Date().toISOString(),
  bytes: bytes.length,
  sha256,
  textChars: text?.length ?? null,
};
await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(JSON.stringify(meta));