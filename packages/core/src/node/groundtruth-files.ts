// File-system glue for ground truth (task 7.1). Reads only `<app>/ground-truth/`.
// It never reads `ground-truth-candidates/`, so agent suggestions cannot affect a gate or a lock.
// `attestGroundTruth` writes the lock and is called only by the human-run `attest` CLI command.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareLock,
  GROUND_TRUTH_LOCK_FILE,
  validateExamples,
  type GroundTruthCheck,
  type GroundTruthFailure,
  type GroundTruthLock,
} from "../groundtruth.js";
import { appPath } from "./approval-files.js";
import { canonicalDigest, sha256Hex } from "./signing.js";

interface Snapshot {
  digests: Record<string, string>;
  /** Parsed JSON examples by file name. */
  examples: Record<string, unknown>;
  failures: GroundTruthFailure[];
}

function readExamples(dir: string): Snapshot {
  const digests: Record<string, string> = {};
  const examples: Record<string, unknown> = {};
  const failures: GroundTruthFailure[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === GROUND_TRUTH_LOCK_FILE) continue;
    const path = join(dir, name);
    if (!statSync(path).isFile() || !name.endsWith(".json")) {
      // Anything that is not a JSON example still changes the directory, so it must be locked or flagged.
      digests[name] = sha256Hex(`unexpected-entry:${name}:${statSync(path).isFile() ? readFileSync(path).toString("base64") : ""}`);
      failures.push({ kind: "invalid-example", file: name, issues: ["only *.json example files are allowed"] });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch {
      digests[name] = sha256Hex(readFileSync(path));
      failures.push({ kind: "invalid-example", file: name, issues: ["unparseable JSON"] });
      continue;
    }
    const d = canonicalDigest(parsed);
    if (!d.ok) {
      digests[name] = sha256Hex(readFileSync(path));
      failures.push({ kind: "invalid-example", file: name, issues: [`${d.code} at ${d.path}`] });
      continue;
    }
    digests[name] = d.digest;
    examples[name] = parsed;
  }
  return { digests, examples, failures };
}

export function groundTruthDir(appDir: string): string {
  return join(appDir, "ground-truth");
}

function readLock(appDir: string): unknown {
  const p = appPath(appDir, "lock");
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as unknown;
  } catch {
    return null; // present but unparseable: reported as a malformed lock
  }
}

/** The ground-truth gate: does the directory still match `ground-truth.lock`? Never writes. */
export function checkGroundTruth(appDir: string): GroundTruthCheck {
  const dir = groundTruthDir(appDir);
  if (!existsSync(dir)) return { ok: false, failures: [{ kind: "no-directory" }] };
  const snap = readExamples(dir);
  const failures: GroundTruthFailure[] = [];
  const cmp = compareLock(readLock(appDir), snap.digests);
  if (!cmp.ok) failures.push(...cmp.failures);
  failures.push(...snap.failures, ...validateExamples(snap.examples));
  if (Object.keys(snap.digests).length === 0 && !failures.some((f) => f.kind === "no-lock")) {
    failures.push({ kind: "no-examples" });
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

export type AttestResult =
  | { ok: true; lock: GroundTruthLock; count: number }
  | { ok: false; failures: GroundTruthFailure[] };

/**
 * Write `ground-truth.lock` over the current examples. Refuses when an example is invalid,
 * ids are duplicated, or there are no examples. Human-run only (CLI `attest`).
 */
export function attestGroundTruth(appDir: string): AttestResult {
  const dir = groundTruthDir(appDir);
  if (!existsSync(dir)) return { ok: false, failures: [{ kind: "no-directory" }] };
  const snap = readExamples(dir);
  const failures = [...snap.failures, ...validateExamples(snap.examples)];
  if (Object.keys(snap.digests).length === 0) failures.push({ kind: "no-examples" });
  if (failures.length > 0) return { ok: false, failures };
  const lock: GroundTruthLock = { schemaVersion: 1, files: snap.digests };
  writeFileSync(appPath(appDir, "lock"), JSON.stringify(lock, null, 2) + "\n");
  return { ok: true, lock, count: Object.keys(snap.digests).length };
}
