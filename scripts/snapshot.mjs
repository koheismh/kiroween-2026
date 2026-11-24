// Fetch a URL and store its bytes, extracted text, and metadata with a SHA-256 hash.
// Usage: node scripts/snapshot.mjs <id> <url> [outDir]
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [id, url, outDir = "spikes/s2/out"] = process.argv.slice(2);
if (!id || !url) {
  console.error("Usage: node scripts/snapshot.mjs <id> <url> [outDir]");
  process.exit(2);
}

const res = await fetch(url, { headers: { "user-agent": "changeling-kit-snapshot/0.0" } });
const bytes = Buffer.from(await res.arrayBuffer());
const contentType = res.headers.get("content-type") ?? "";
const sha256 = createHash("sha256").update(bytes).digest("hex");

function decode(buf, type) {
  const m = /charset=([^;]+)/i.exec(type);
  const head = buf.subarray(0, 2048).toString("latin1");
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  const label = (m?.[1] ?? meta?.[1] ?? "utf-8").trim();
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function htmlToText(html) {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br|table|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const isHtml = /html/i.test(contentType);
const isPdf = /pdf/i.test(contentType);
const text = isHtml ? htmlToText(decode(bytes, contentType)) : isPdf ? null : decode(bytes, contentType);

const dir = join(outDir, id);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "original.bin"), bytes);
if (text !== null) await writeFile(join(dir, "extracted.txt"), text, "utf8");
const meta = {
  id,
  url,
  finalUrl: res.url,
  status: res.status,
  contentType,
  retrievedAt: new Date().toISOString(),
  bytes: bytes.length,
  sha256,
  textChars: text?.length ?? null,
};
await writeFile(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8");
console.log(JSON.stringify(meta));
