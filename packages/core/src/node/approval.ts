// Approval record: preparation (for `approve`) and verification (shared loader check, R5).
// Everything here is pure: callers pass parsed JSON, keys, and `approvedAt` explicitly.
// No file, clock, or environment access. File handling is in approval-files.ts.
import { z } from "zod";
import { isIsoDate } from "../dates.js";
import { checkGateReport, REQUIRED_GATES, type GateCheckFailure } from "../gates.js";
import { checkTrustAnchors, type TrustAnchors } from "../trust.js";
import { canonicalDigest, publicKeyId, verifyPayload, type ApprovalPayload } from "./signing.js";

const HEX64 = /^[0-9a-f]{64}$/;

export const ApprovalRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    payload: z
      .object({
        packDigest: z.string().regex(HEX64),
        gateReportDigest: z.string().regex(HEX64),
        groundTruthLockDigest: z.string().regex(HEX64),
        approverKeyId: z.string().regex(HEX64),
        approvedAt: z.string().refine(isIsoDate, "expected YYYY-MM-DD"),
      })
      .strict(),
    /** Ed25519 signature over the canonical payload, base64. */
    signature: z.string().min(1),
  })
  .strict();
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

export interface ApprovalInputs {
  /** Parsed pack.json. */
  pack: unknown;
  /** Parsed gate report, or undefined when absent. */
  gateReport: unknown;
  /** Parsed ground-truth lock, or undefined when absent. */
  groundTruthLock: unknown;
}

export type FailedCheck = "pack-digest" | "gate-digest" | "gt-lock" | "signature" | "key-id" | "no-trust-anchor" | "untrusted-key" | "gates" | "record";

export type ApprovalFailure = {
  ok: false;
  failed: FailedCheck;
  detail: string;
  gateFailures?: GateCheckFailure[];
};

export type VerifyApprovalResult = { ok: true; payload: ApprovalPayload } | ApprovalFailure;

export type PrepareApprovalResult = { ok: true; payload: ApprovalPayload } | ApprovalFailure;

interface Digests {
  packDigest: string;
  gateReportDigest: string;
  groundTruthLockDigest: string;
}

function digestOf(value: unknown, failed: FailedCheck, what: string): { ok: true; digest: string } | ApprovalFailure {
  if (value === undefined) return { ok: false, failed, detail: `${what} is missing` };
  const d = canonicalDigest(value);
  if (!d.ok) return { ok: false, failed, detail: `${what} is not canonicalizable: ${d.code} at ${d.path}` };
  return d;
}

/** Recompute the three digests. The first failing check is reported in a fixed order. */
function computeDigests(inputs: ApprovalInputs): { ok: true; digests: Digests } | ApprovalFailure {
  const p = digestOf(inputs.pack, "pack-digest", "pack");
  if (!p.ok) return p;
  const g = digestOf(inputs.gateReport, "gate-digest", "gate report");
  if (!g.ok) return g;
  const l = digestOf(inputs.groundTruthLock, "gt-lock", "ground-truth lock");
  if (!l.ok) return l;
  return { ok: true, digests: { packDigest: p.digest, gateReportDigest: g.digest, groundTruthLockDigest: l.digest } };
}

function gateFailure(inputs: ApprovalInputs, packDigest: string, required: readonly string[]): ApprovalFailure | null {
  const res = checkGateReport(inputs.gateReport, packDigest, required);
  if (res.ok) return null;
  const detail = res.failures
    .map((f) => {
      switch (f.kind) {
        case "malformed":
          return `malformed report (${f.issues.join("; ")})`;
        case "stale":
          return "gate report is bound to a different pack digest";
        default:
          return `${f.kind} gates: ${f.gateIds.join(", ")}`;
      }
    })
    .join(" | ");
  return { ok: false, failed: "gates", detail, gateFailures: res.failures };
}

/**
 * Build the payload that `approve` signs. Refuses unless the gate report is bound to the
 * current pack digest and every required gate passed. `approvedAt` is supplied by the caller.
 */
export function prepareApproval(
  inputs: ApprovalInputs,
  approverKeyId: string,
  approvedAt: string,
  required: readonly string[] = REQUIRED_GATES,
): PrepareApprovalResult {
  if (!isIsoDate(approvedAt)) return { ok: false, failed: "record", detail: "approvedAt must be YYYY-MM-DD" };
  const d = computeDigests(inputs);
  if (!d.ok) return d;
  const gf = gateFailure(inputs, d.digests.packDigest, required);
  if (gf) return gf;
  return { ok: true, payload: { ...d.digests, approverKeyId, approvedAt } };
}

/**
 * Loader check. Recomputes digests from the current files, applies the same gate check as
 * `approve`, and verifies the signature against the committed public key.
 * The public key is trusted only if its key id equals the configured trust anchor(s); with no anchor
 * the check fails closed. The stored gate report is checked as tamper evidence only. Gate
 * recomputation belongs to `approve` (task 7.5).
 * Order: record shape, trust anchor, key id, digests (pack, gate report, lock), signature, gates.
 */
export function verifyApproval(
  inputs: ApprovalInputs,
  record: unknown,
  publicKeyPem: string | undefined,
  trust: TrustAnchors,
  required: readonly string[] = REQUIRED_GATES,
): VerifyApprovalResult {
  const parsed = ApprovalRecordSchema.safeParse(record);
  if (!parsed.success) {
    return {
      ok: false,
      failed: "record",
      detail: parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`).join("; "),
    };
  }
  const rec = parsed.data;

  if (publicKeyPem === undefined) return { ok: false, failed: "key-id", detail: "approver public key is missing" };
  const keyId = publicKeyId(publicKeyPem);
  if (keyId === null) return { ok: false, failed: "key-id", detail: "approver public key is not a valid key" };
  const tc = checkTrustAnchors(keyId, trust);
  if (!tc.ok) return tc;
  if (keyId !== rec.payload.approverKeyId) {
    return { ok: false, failed: "key-id", detail: "record was signed by a different key than the committed public key" };
  }

  const d = computeDigests(inputs);
  if (!d.ok) return d;
  if (d.digests.packDigest !== rec.payload.packDigest) {
    return { ok: false, failed: "pack-digest", detail: "pack changed since approval" };
  }
  if (d.digests.gateReportDigest !== rec.payload.gateReportDigest) {
    return { ok: false, failed: "gate-digest", detail: "gate report changed since approval" };
  }
  if (d.digests.groundTruthLockDigest !== rec.payload.groundTruthLockDigest) {
    return { ok: false, failed: "gt-lock", detail: "ground-truth lock changed since approval" };
  }

  const sig = verifyPayload(rec.payload, rec.signature, publicKeyPem);
  if (!sig.ok) return { ok: false, failed: "signature", detail: sig.code };

  const gf = gateFailure(inputs, d.digests.packDigest, required);
  if (gf) return gf;

  return { ok: true, payload: rec.payload };
}
