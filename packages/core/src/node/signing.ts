// Node-only digests and Ed25519 signing for approval records (task 6.1).
// Keys are PEM strings supplied by the caller; this module never reads or writes key files.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import { canonicalize, type CanonicalResult } from "../canonical.js";

export type DigestResult =
  | { ok: true; digest: string }
  | Extract<CanonicalResult, { ok: false }>;

/** SHA-256 of bytes, as lowercase hex. */
export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** SHA-256 over the canonical JSON of a value (UTF-8 bytes). */
export function canonicalDigest(value: unknown): DigestResult {
  const c = canonicalize(value);
  return c.ok ? { ok: true, digest: sha256Hex(c.json) } : c;
}

/** The record an approver signs (see design.md, Approval flow). */
export interface ApprovalPayload {
  packDigest: string;
  gateReportDigest: string;
  groundTruthLockDigest: string;
  approverKeyId: string;
  approvedAt: string;
}

export type SignResult =
  | { ok: true; signature: string }
  | { ok: false; code: "NON_INTEGER_NUMBER" | "UNSUPPORTED_VALUE" | "BAD_KEY"; path?: string };

export type VerifyResult =
  | { ok: true }
  | { ok: false; code: "BAD_SIGNATURE" | "BAD_KEY" | "NON_INTEGER_NUMBER" | "UNSUPPORTED_VALUE" };

export interface KeyPairPem {
  publicKeyPem: string;
  /** PKCS#8 PEM, encrypted with the passphrase. */
  privateKeyPem: string;
  /** SHA-256 hex of the SPKI DER public key. */
  keyId: string;
}

export function publicKeyId(publicKeyPem: string): string | null {
  try {
    const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
    return sha256Hex(der);
  } catch {
    return null;
  }
}

/** Generate an Ed25519 key pair; the private key is encrypted with the passphrase. */
export function generateApproverKey(passphrase: string): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey, keyId: publicKeyId(publicKey) as string };
}

/** Sign the canonical JSON of a payload. Returns the signature as base64. */
export function signPayload(payload: unknown, privateKeyPem: string, passphrase?: string): SignResult {
  const c = canonicalize(payload);
  if (!c.ok) return c;
  try {
    const key = createPrivateKey({ key: privateKeyPem, format: "pem", passphrase });
    return { ok: true, signature: sign(null, Buffer.from(c.json, "utf8"), key).toString("base64") };
  } catch {
    return { ok: false, code: "BAD_KEY" };
  }
}

/** Verify a base64 signature over the canonical JSON of a payload. Never throws. */
export function verifyPayload(payload: unknown, signatureBase64: string, publicKeyPem: string): VerifyResult {
  const c = canonicalize(payload);
  if (!c.ok) return c;
  try {
    const key = createPublicKey(publicKeyPem);
    const ok = verify(null, Buffer.from(c.json, "utf8"), key, Buffer.from(signatureBase64, "base64"));
    return ok ? { ok: true } : { ok: false, code: "BAD_SIGNATURE" };
  } catch {
    return { ok: false, code: "BAD_KEY" };
  }
}
