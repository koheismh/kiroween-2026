import { describe, expect, it } from "vitest";
import { canonicalize } from "../canonical.js";
import {
  canonicalDigest,
  generateApproverKey,
  publicKeyId,
  sha256Hex,
  signPayload,
  verifyPayload,
  type ApprovalPayload,
} from "./signing.js";

const payload: ApprovalPayload = {
  packDigest: "a".repeat(64),
  gateReportDigest: "b".repeat(64),
  groundTruthLockDigest: "c".repeat(64),
  approverKeyId: "k",
  approvedAt: "2026-11-24",
};

describe("canonicalize", () => {
  it("sorts keys at every depth and drops whitespace", () => {
    const r = canonicalize({ b: 1, a: { d: [2, { z: 1, y: null }], c: "x" } });
    expect(r).toEqual({ ok: true, json: '{"a":{"c":"x","d":[2,{"y":null,"z":1}]},"b":1}' });
  });
  it("is independent of key insertion order", () => {
    expect(canonicalize({ a: 1, b: 2 })).toEqual(canonicalize({ b: 2, a: 1 }));
  });
  it("rejects floats and reports the path", () => {
    expect(canonicalize({ a: [1, 1.5] })).toEqual({ ok: false, code: "NON_INTEGER_NUMBER", path: "$.a[1]" });
    expect(canonicalize(NaN).ok).toBe(false);
  });
  it("rejects unsupported values", () => {
    expect(canonicalize({ a: undefined })).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
    expect(canonicalize(new Date(0))).toMatchObject({ ok: false, code: "UNSUPPORTED_VALUE" });
  });
});

describe("digests", () => {
  it("matches the known SHA-256 of 'abc'", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("changes when any value changes", () => {
    const a = canonicalDigest({ x: 1 });
    const b = canonicalDigest({ x: 2 });
    expect(a.ok && b.ok && a.digest !== b.digest).toBe(true);
  });
  it("returns a typed failure for floats", () => {
    expect(canonicalDigest({ x: 0.1 })).toMatchObject({ ok: false, code: "NON_INTEGER_NUMBER" });
  });
});

describe("Ed25519 sign and verify", () => {
  const key = generateApproverKey("test-passphrase");
  const sig = signPayload(payload, key.privateKeyPem, "test-passphrase");

  it("verifies a signature, regardless of key order", () => {
    expect(sig.ok).toBe(true);
    if (!sig.ok) return;
    const reordered = Object.fromEntries(Object.entries(payload).reverse());
    expect(verifyPayload(reordered, sig.signature, key.publicKeyPem)).toEqual({ ok: true });
  });
  it("detects a modified payload", () => {
    if (!sig.ok) throw new Error("sign failed");
    const r = verifyPayload({ ...payload, packDigest: "d".repeat(64) }, sig.signature, key.publicKeyPem);
    expect(r).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });
  it("detects a modified signature and a different key", () => {
    if (!sig.ok) throw new Error("sign failed");
    const bytes = Buffer.from(sig.signature, "base64");
    bytes[0] ^= 1;
    expect(verifyPayload(payload, bytes.toString("base64"), key.publicKeyPem)).toMatchObject({ ok: false });
    const other = generateApproverKey("x");
    expect(verifyPayload(payload, sig.signature, other.publicKeyPem)).toEqual({ ok: false, code: "BAD_SIGNATURE" });
  });
  it("refuses a wrong passphrase and a garbage public key without throwing", () => {
    expect(signPayload(payload, key.privateKeyPem, "wrong")).toEqual({ ok: false, code: "BAD_KEY" });
    expect(verifyPayload(payload, "AAAA", "not a key")).toEqual({ ok: false, code: "BAD_KEY" });
  });
  it("derives a stable key id", () => {
    expect(publicKeyId(key.publicKeyPem)).toBe(key.keyId);
    expect(publicKeyId("junk")).toBeNull();
  });
});
