// Throwaway spike S3: verify node:crypto Ed25519 signatures with WebCrypto in a real headless browser.
// Usage: npm run typecheck (builds dist) && node spikes/s3/browser-verify.mjs
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateApproverKey, signPayload } from "../../packages/core/dist/node/signing.js";

const payload = { packDigest: "ab12", approvedAt: "2026-11-24", n: 3, z: ["é", "日本"] };
const k = generateApproverKey("spike");
const sig = signPayload(payload, k.privateKeyPem, "spike");
const fixture = {
  payload,
  tampered: { ...payload, n: 4 },
  signature: sig.signature,
  publicKeyPem: k.publicKeyPem,
};

const page = `<!doctype html><meta charset="utf-8"><body><pre id="r">PENDING</pre>
<script type="module">
import { verifyPayloadWeb } from "/webverify.js";
const f = ${JSON.stringify(fixture)};
const out = { ua: navigator.userAgent, secure: isSecureContext };
try {
  out.valid = await verifyPayloadWeb(f.payload, f.signature, f.publicKeyPem);
  out.tampered = await verifyPayloadWeb(f.tampered, f.signature, f.publicKeyPem);
} catch (e) { out.error = String(e); }
document.getElementById("r").textContent = "RESULT:" + JSON.stringify(out);
</script>`;

const dist = new URL("../../packages/core/dist/", import.meta.url);
const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "content-type": "text/html" }).end(page);
  } else if (/^\/(webverify|canonical)\.js$/.test(req.url)) {
    res.writeHead(200, { "content-type": "text/javascript" }).end(readFileSync(new URL("." + req.url, dist)));
  } else res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Async: a sync spawn would block the event loop and starve the local server.
const run = (exe, args, timeout) =>
  new Promise((res, rej) => execFile(exe, args, { encoding: "utf8", timeout }, (e, out) => (e ? rej(e) : res(out))));
const candidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(existsSync);
for (const exe of candidates) {
  const profile = mkdtempSync(join(tmpdir(), "s3-"));
  try {
    const dom = await run(
      exe,
      ["--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--virtual-time-budget=5000", "--dump-dom", url],
      60000,
    );
    const m = dom.match(/RESULT:(\{.*\})/);
    console.log(exe, "\n", m ? m[1] : "no result; DOM: " + dom.slice(0, 300));
  } catch (e) {
    console.log(exe, "FAILED", String(e.message).slice(0, 300));
  }
}
server.close();
