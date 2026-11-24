// Task 6.4: tamper detection and gate refusal across prepareApproval (approve) and verifyApproval/verifyApp (loader).
// Temp directories only. Keys are generated in memory and never written outside the temp dir.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REQUIRED_GATES } from "../gates.js";
import { prepareApproval, verifyApproval, type ApprovalInputs } from "./approval.js";
import { appPath, prepareApp, verifyApp } from "./approval-files.js";
import { canonicalDigest, generateApproverKey, signPayload, type ApprovalPayload } from "./signing.js";

const PASS = "test-passphrase";
const TRUST = { pinnedKeyId: undefined as string | undefined };
const key = generateApproverKey(PASS);
TRUST.pinnedKeyId = key.keyId;

const pack = { schemaVersion: 1, rules: [{ id: "a", n: 1 }] };
const lock = { files: { "x.json": "a".repeat(64) } };

function dig(v: unknown): string {
  const d = canonicalDigest(v);
  if (!d.ok) throw new Error("digest");
  return d.digest;
}

function report(packDigest: string, failId?: string, omitId?: string) {
  return {
    schemaVersion: 1,
    packDigest,
    gates: REQUIRED_GATES.filter((id) => id !== omitId).map((id) => ({
      id,
      status: id === failId ? "fail" : "pass",
    })),
  };
}

function inputs(over: Partial<ApprovalInputs> = {}): ApprovalInputs {
  return { pack, gateReport: report(dig(pack)), groundTruthLock: lock, ...over };
}

function signed(i: ApprovalInputs): { record: unknown; payload: ApprovalPayload } {
  const payload: ApprovalPayload = {
    packDigest: dig(i.pack),
    gateReportDigest: dig(i.gateReport),
    groundTruthLockDigest: dig(i.groundTruthLock),
    approverKeyId: key.keyId,
    approvedAt: "2025-01-03",
  };
  const s = signPayload(payload, key.privateKeyPem, PASS);
  if (!s.ok) throw new Error("sign");
  return { record: { schemaVersion: 1, payload, signature: s.signature }, payload };
}

describe("verifyApproval: tamper detection", () => {
  it("accepts untouched inputs", () => {
    const i = inputs();
    expect(verifyApproval(i, signed(i).record, key.publicKeyPem, TRUST)).toMatchObject({ ok: true });
  });

  it("names pack-digest when the pack is modified", () => {
    const i = inputs();
    const { record } = signed(i);
    const r = verifyApproval({ ...i, pack: { ...pack, extra: 1 } }, record, key.publicKeyPem, TRUST);
    expect(r).toMatchObject({ ok: false, failed: "pack-digest" });
  });

  it("names gate-digest when the gate report is modified but still passing", () => {
    const i = inputs();
    const { record } = signed(i);
    const tampered = { ...(i.gateReport as object), gates: [...report(dig(pack)).gates, { id: "extra", status: "pass" }] };
    const r = verifyApproval({ ...i, gateReport: tampered }, record, key.publicKeyPem, TRUST);
    expect(r).toMatchObject({ ok: false, failed: "gate-digest" });
  });

  it("names gt-lock when the ground-truth lock is modified", () => {
    const i = inputs();
    const { record } = signed(i);
    const r = verifyApproval({ ...i, groundTruthLock: { files: {} } }, record, key.publicKeyPem, TRUST);
    expect(r).toMatchObject({ ok: false, failed: "gt-lock" });
  });

  it("names signature when the signature bytes are modified", () => {
    const i = inputs();
    const { record } = signed(i) as { record: { signature: string } };
    const bytes = Buffer.from(record.signature, "base64");
    bytes[0] ^= 1;
    const r = verifyApproval(i, { ...record, signature: bytes.toString("base64") }, key.publicKeyPem, TRUST);
    expect(r).toMatchObject({ ok: false, failed: "signature" });
  });

  it("names signature when the payload is edited consistently with the files", () => {
    // Attacker changes the pack and rewrites the payload digest but cannot re-sign.
    const newPack = { ...pack, extra: 1 };
    const i = inputs({ pack: newPack, gateReport: report(dig(newPack)) });
    const { record } = signed(inputs()) as { record: { payload: ApprovalPayload; signature: string } };
    const forged = {
      ...record,
      payload: { ...record.payload, packDigest: dig(newPack), gateReportDigest: dig(i.gateReport) },
    };
    expect(verifyApproval(i, forged, key.publicKeyPem, TRUST)).toMatchObject({ ok: false, failed: "signature" });
  });
});

describe("approval refused on failed, missing, and stale gates", () => {
  const cases: [string, () => ApprovalInputs, string][] = [
    ["failed gate", () => inputs({ gateReport: report(dig(pack), "citations") }), "failed"],
    ["missing gate", () => inputs({ gateReport: report(dig(pack), undefined, "ground-truth") }), "missing"],
    ["stale report", () => inputs({ gateReport: report(dig({ ...pack, old: 1 })) }), "stale"],
  ];

  for (const [name, make, kind] of cases) {
    it(`prepareApproval refuses a ${name}`, () => {
      const r = prepareApproval(make(), key.keyId, "2025-01-03");
      expect(r).toMatchObject({ ok: false, failed: "gates" });
      if (!r.ok) expect(r.gateFailures?.some((f) => f.kind === kind)).toBe(true);
    });

    it(`verifyApproval refuses a record signed over a ${name}`, () => {
      const i = make();
      const r = verifyApproval(i, signed(i).record, key.publicKeyPem, TRUST);
      expect(r).toMatchObject({ ok: false, failed: "gates" });
      if (!r.ok) expect(r.gateFailures?.some((f) => f.kind === kind)).toBe(true);
    });
  }

  it("prepareApproval refuses when the gate report is absent", () => {
    expect(prepareApproval(inputs({ gateReport: undefined }), key.keyId, "2025-01-03")).toMatchObject({
      ok: false,
      failed: "gate-digest",
    });
  });
});

describe("verifyApp (loader) on files in a temp dir", () => {
  let app: string;

  function write(k: Parameters<typeof appPath>[1], v: unknown): void {
    const p = appPath(app, k);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
  }

  function writeAll(i: ApprovalInputs): void {
    write("pack", i.pack);
    write("gateReport", i.gateReport);
    write("lock", i.groundTruthLock);
    write("publicKey", key.publicKeyPem);
    write("trustAnchor", { schemaVersion: 1, approverKeyId: key.keyId });
    write("record", signed(i).record);
  }

  beforeEach(() => {
    app = mkdtempSync(join(tmpdir(), "changeling-approval-"));
  });
  afterEach(() => rmSync(app, { recursive: true, force: true }));

  it("passes when untouched", () => {
    writeAll(inputs());
    expect(verifyApp(app)).toMatchObject({ ok: true });
  });

  it("names the failing check for each tampered file", () => {
    const i = inputs();
    writeAll(i);
    write("pack", { ...pack, extra: 1 });
    expect(verifyApp(app)).toMatchObject({ failed: "pack-digest" });
    write("pack", pack);

    write("gateReport", { ...(i.gateReport as object), gates: [] });
    expect(verifyApp(app)).toMatchObject({ failed: "gate-digest" });
    write("gateReport", i.gateReport);

    write("lock", { files: {} });
    expect(verifyApp(app)).toMatchObject({ failed: "gt-lock" });
    write("lock", lock);

    const rec = signed(i).record as { signature: string };
    const bytes = Buffer.from(rec.signature, "base64");
    bytes[0] ^= 1;
    write("record", { ...rec, signature: bytes.toString("base64") });
    expect(verifyApp(app)).toMatchObject({ failed: "signature" });
  });

  it("names gt-lock when the lock file is deleted after approval", () => {
    writeAll(inputs());
    rmSync(appPath(app, "lock"));
    expect(verifyApp(app)).toMatchObject({ ok: false, failed: "gt-lock" });
  });

  it("prepareApp refuses a failing gate report on disk", () => {
    writeAll(inputs({ gateReport: report(dig(pack), "schema") }));
    expect(prepareApp(app, key.keyId, "2025-01-03")).toMatchObject({ ok: false, failed: "gates" });
  });

  it("verifyApp refuses a record signed over a failing report on disk", () => {
    writeAll(inputs({ gateReport: report(dig(pack), "schema") }));
    expect(verifyApp(app)).toMatchObject({ ok: false, failed: "gates" });
  });
});

describe("trust anchor (key substitution)", () => {
  const attacker = generateApproverKey(PASS);
  /** Attacker swaps the public key and re-signs everything consistently. */
  function resigned(i: ApprovalInputs): unknown {
    const payload: ApprovalPayload = {
      packDigest: dig(i.pack),
      gateReportDigest: dig(i.gateReport),
      groundTruthLockDigest: dig(i.groundTruthLock),
      approverKeyId: attacker.keyId,
      approvedAt: "2025-01-04",
    };
    const s = signPayload(payload, attacker.privateKeyPem, PASS);
    if (!s.ok) throw new Error("sign");
    return { schemaVersion: 1, payload, signature: s.signature };
  }
  it("rejects a self-consistent substituted key with a valid re-sign (untrusted-key)", () => {
    const i = inputs();
    const r = verifyApproval(i, resigned(i), attacker.publicKeyPem, { pinnedKeyId: key.keyId });
    expect(r).toMatchObject({ ok: false, failed: "untrusted-key" });
  });
  it("accepts the same attacker record when the anchor is the attacker key (anchor and key changed together)", () => {
    const i = inputs();
    expect(verifyApproval(i, resigned(i), attacker.publicKeyPem, { pinnedKeyId: attacker.keyId })).toMatchObject({ ok: true });
  });
  it("fails closed with no anchor configured", () => {
    const i = inputs();
    expect(verifyApproval(i, signed(i).record, key.publicKeyPem, {})).toMatchObject({ ok: false, failed: "no-trust-anchor" });
  });
  it("fails closed on a malformed anchor", () => {
    const i = inputs();
    expect(verifyApproval(i, signed(i).record, key.publicKeyPem, { pinnedKeyId: "nothex" })).toMatchObject({
      ok: false,
      failed: "no-trust-anchor",
    });
  });
  it("passes with the correct pinned anchor, the correct out-of-band id, or both", () => {
    const i = inputs();
    const rec = signed(i).record;
    expect(verifyApproval(i, rec, key.publicKeyPem, { pinnedKeyId: key.keyId })).toMatchObject({ ok: true });
    expect(verifyApproval(i, rec, key.publicKeyPem, { outOfBandKeyId: key.keyId })).toMatchObject({ ok: true });
    expect(verifyApproval(i, rec, key.publicKeyPem, { pinnedKeyId: key.keyId, outOfBandKeyId: key.keyId })).toMatchObject({ ok: true });
  });
  it("rejects when the out-of-band id disagrees with the repo anchor", () => {
    const i = inputs();
    const r = verifyApproval(i, signed(i).record, key.publicKeyPem, { pinnedKeyId: key.keyId, outOfBandKeyId: attacker.keyId });
    expect(r).toMatchObject({ ok: false, failed: "untrusted-key" });
  });
  describe("verifyApp", () => {
    let app: string;
    beforeEach(() => {
      app = mkdtempSync(join(tmpdir(), "changeling-trust-"));
      const put = (k: Parameters<typeof appPath>[1], v: unknown): void => {
        mkdirSync(dirname(appPath(app, k)), { recursive: true });
        writeFileSync(appPath(app, k), typeof v === "string" ? v : JSON.stringify(v));
      };
      const i = inputs();
      put("pack", i.pack);
      put("gateReport", i.gateReport);
      put("lock", i.groundTruthLock);
      put("publicKey", attacker.publicKeyPem);
      put("record", resigned(i));
    });
    afterEach(() => rmSync(app, { recursive: true, force: true }));
    it("fails closed with no trust-anchor.json and no out-of-band id", () => {
      expect(verifyApp(app)).toMatchObject({ ok: false, failed: "no-trust-anchor" });
    });
    it("rejects key substitution when trust-anchor.json pins the real key", () => {
      writeFileSync(appPath(app, "trustAnchor"), JSON.stringify({ schemaVersion: 1, approverKeyId: key.keyId }));
      expect(verifyApp(app)).toMatchObject({ ok: false, failed: "untrusted-key" });
    });
    it("rejects key substitution when only the out-of-band id is the real key", () => {
      expect(verifyApp(app, key.keyId)).toMatchObject({ ok: false, failed: "untrusted-key" });
    });
    it("fails closed on an unparseable trust-anchor.json", () => {
      writeFileSync(appPath(app, "trustAnchor"), "{");
      expect(verifyApp(app)).toMatchObject({ ok: false, failed: "no-trust-anchor" });
    });
  });
});