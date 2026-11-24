// Browser-safe Ed25519 verification of approval signatures (task 6.5).
// Uses only WebCrypto (globalThis.crypto.subtle), atob, and TextEncoder; no node: imports.
import { canonicalize } from "./canonical.js";

export type WebVerifyResult =
  | { ok: true }
  | { ok: false; code: "BAD_SIGNATURE" | "BAD_KEY" | "NON_INTEGER_NUMBER" | "UNSUPPORTED_VALUE" | "NO_WEBCRYPTO" };

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  return base64ToBytes(b64);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify a base64 Ed25519 signature over the canonical JSON of a payload, using an SPKI PEM public key.
 * Never throws. Same bytes as node:crypto `verifyPayload`.
 */
export async function verifyPayloadWeb(
  payload: unknown,
  signatureBase64: string,
  publicKeyPem: string,
): Promise<WebVerifyResult> {
  const c = canonicalize(payload);
  if (!c.ok) return { ok: false, code: c.code };
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { ok: false, code: "NO_WEBCRYPTO" };
  try {
    const key = await subtle.importKey("spki", pemToDer(publicKeyPem) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const ok = await subtle.verify(
      { name: "Ed25519" },
      key,
      base64ToBytes(signatureBase64) as BufferSource,
      new TextEncoder().encode(c.json),
    );
    return ok ? { ok: true } : { ok: false, code: "BAD_SIGNATURE" };
  } catch {
    return { ok: false, code: "BAD_KEY" };
  }
}
