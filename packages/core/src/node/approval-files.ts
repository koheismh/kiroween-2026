// File-system glue for approval: reads an app directory and calls the pure functions.
// Layout (relative to the app directory):
//   rules/pack.json                       the pack
//   gate-report.json                      gate report for the current pack
//   ground-truth/ground-truth.lock        lock written by `attest` (task 7.1)
//   trust-anchor.json                     pinned approver key id (outside approvals/, reviewed in a commit)
//   approvals/approver.pub                approver public key (PEM text)
//   approvals/approval.json               signed approval record
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isKeyId, type TrustAnchors } from "../trust.js";
import {
  prepareApproval,
  verifyApproval,
  type ApprovalFailure,
  type ApprovalInputs,
  type VerifyApprovalResult,
} from "./approval.js";

export const APP_FILES = {
  pack: ["rules", "pack.json"],
  gateReport: ["gate-report.json"],
  lock: ["ground-truth", "ground-truth.lock"],
  trustAnchor: ["trust-anchor.json"],
  publicKey: ["approvals", "approver.pub"],
  record: ["approvals", "approval.json"],
} as const;

export function appPath(appDir: string, key: keyof typeof APP_FILES): string {
  return join(appDir, ...APP_FILES[key]);
}

type Read = { ok: true; value: unknown } | { ok: false; reason: "missing" | "unparseable" };

function readJson(path: string): Read {
  if (!existsSync(path)) return { ok: false, reason: "missing" };
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch {
    return { ok: false, reason: "unparseable" };
  }
}

/** Missing and unparseable files both become `undefined`, which the pure checks report as failures. */
export function readApprovalInputs(appDir: string): { inputs: ApprovalInputs; unparseable: string[] } {
  const unparseable: string[] = [];
  const get = (key: keyof typeof APP_FILES): unknown => {
    const r = readJson(appPath(appDir, key));
    if (r.ok) return r.value;
    if (r.reason === "unparseable") unparseable.push(APP_FILES[key].join("/"));
    return undefined;
  };
  return { inputs: { pack: get("pack"), gateReport: get("gateReport"), groundTruthLock: get("lock") }, unparseable };
}

export function readPublicKey(appDir: string): string | undefined {
  const p = appPath(appDir, "publicKey");
  return existsSync(p) ? readFileSync(p, "utf8") : undefined;
}

/**
 * Read the pinned key id from `trust-anchor.json` ({"schemaVersion":1,"approverKeyId":"<hex>"}).
 * A missing file gives no pinned id. A present but malformed file gives an invalid marker so the check fails closed.
 */
export function readTrustAnchors(appDir: string, outOfBandKeyId?: string): TrustAnchors {
  const r = readJson(appPath(appDir, "trustAnchor"));
  let pinned: string | undefined;
  if (r.ok) {
    const v = r.value as { schemaVersion?: unknown; approverKeyId?: unknown } | null;
    pinned = v?.schemaVersion === 1 && isKeyId(v.approverKeyId) ? v.approverKeyId : "invalid";
  } else if (r.reason === "unparseable") pinned = "invalid";
  return { pinnedKeyId: pinned, outOfBandKeyId };
}

/** Shared loader check for an app directory. Used by the `verify` CLI. */
export function verifyApp(appDir: string, outOfBandKeyId?: string): VerifyApprovalResult {
  const { inputs, unparseable } = readApprovalInputs(appDir);
  if (unparseable.length > 0) {
    return { ok: false, failed: "record", detail: `unparseable JSON: ${unparseable.join(", ")}` };
  }
  const rec = readJson(appPath(appDir, "record"));
  if (!rec.ok) return { ok: false, failed: "record", detail: `approval record is ${rec.reason}` };
  return verifyApproval(inputs, rec.value, readPublicKey(appDir), readTrustAnchors(appDir, outOfBandKeyId));
}

/** Pre-sign check for `approve`: same digests and gate check as the loader. */
export function prepareApp(appDir: string, approverKeyId: string, approvedAt: string) {
  const { inputs, unparseable } = readApprovalInputs(appDir);
  if (unparseable.length > 0) {
    const f: ApprovalFailure = { ok: false, failed: "record", detail: `unparseable JSON: ${unparseable.join(", ")}` };
    return f;
  }
  return prepareApproval(inputs, approverKeyId, approvedAt);
}
