// Trust anchor check for the approver key (R5). Pure and browser-safe: no node: imports.
// The anchor is the expected approver key ID (SHA-256 of the SPKI DER, lowercase hex).
// Anchors come from two places, both optional individually but at least one is required:
//   pinnedKeyId     read from the repo trust file, outside approvals/ (reviewed in a commit)
//   outOfBandKeyId  passed by the verifier (CLI flag, env var, or embedded at web build time)
// When both are present, the key ID must equal both. Fail closed when neither is present.
const HEX64 = /^[0-9a-f]{64}$/;

export interface TrustAnchors {
  pinnedKeyId?: string | undefined;
  outOfBandKeyId?: string | undefined;
}

export type TrustCheck =
  | { ok: true }
  | { ok: false; failed: "no-trust-anchor" | "untrusted-key"; detail: string };

export function isKeyId(s: unknown): s is string {
  return typeof s === "string" && HEX64.test(s);
}

/** Check that `keyId` matches every configured anchor. Never throws. */
export function checkTrustAnchors(keyId: string, anchors: TrustAnchors): TrustCheck {
  const configured: [string, string][] = [];
  if (anchors.pinnedKeyId !== undefined) configured.push(["pinned trust anchor", anchors.pinnedKeyId]);
  if (anchors.outOfBandKeyId !== undefined) configured.push(["out-of-band key id", anchors.outOfBandKeyId]);
  if (configured.length === 0) {
    return { ok: false, failed: "no-trust-anchor", detail: "no trust anchor is configured; refusing to trust the committed public key" };
  }
  for (const [name, id] of configured) {
    if (!isKeyId(id)) return { ok: false, failed: "no-trust-anchor", detail: `${name} is not a 64-character lowercase hex key id` };
  }
  for (const [name, id] of configured) {
    if (id !== keyId) {
      return { ok: false, failed: "untrusted-key", detail: `public key id ${keyId.slice(0, 16)} does not match the ${name}` };
    }
  }
  return { ok: true };
}
