// Ground-truth example format, lock format, and the pure lock comparison (task 7.1, R6, R5.2).
// Pure and environment-neutral. Reading the directory and hashing is the node layer's job
// (see node/groundtruth-files.ts). Agent-suggested candidates are never an input to this module.
import { z } from "zod";
import { isIsoDate } from "./dates.js";
import type { GateResult } from "./gates.js";

const HEX64 = /^[0-9a-f]{64}$/;
const IsoDate = z.string().refine(isIsoDate, "expected YYYY-MM-DD");
/** JSON value with integers, strings, booleans and null only. Floats are rejected at any depth. */
export type FactValue = number | string | boolean | null | FactValue[] | { [key: string]: FactValue };
const FactValueSchema: z.ZodType<FactValue> = z.lazy(() =>
  z.union([z.number().int().safe(), z.string(), z.boolean(), z.null(), z.array(FactValueSchema), z.record(z.string(), FactValueSchema)]),
);

/** One human-attested example taken from an official source. */
export const GroundTruthExampleSchema = z
  .object({
    id: z.string().min(1),
    /** Snapshot id under apps/<app>/sources/. */
    sourceId: z.string().min(1),
    /** Where in the source the example appears (section, table, page). */
    locator: z.string().min(1),
    /** Evaluation period (an ISO date inside the period) and knowledge date. */
    period: IsoDate,
    knowledgeDate: IsoDate,
    facts: z.record(z.string(), FactValueSchema),
    /** Expected output as the source states it. Integers only; no floating-point numbers; at least one key. */
    expected: z.record(z.string(), FactValueSchema).refine((e) => Object.keys(e).length > 0, "expected must not be empty"),
    /** Name of the human who attested the example. */
    attester: z.string().min(1),
  })
  .strict();
export type GroundTruthExample = z.infer<typeof GroundTruthExampleSchema>;

export const GROUND_TRUTH_LOCK_FILE = "ground-truth.lock";

export const GroundTruthLockSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** File name in the ground-truth directory -> SHA-256 hex of the canonical example JSON. */
    files: z.record(z.string().min(1), z.string().regex(HEX64)),
  })
  .strict();
export type GroundTruthLock = z.infer<typeof GroundTruthLockSchema>;

export type GroundTruthFailure =
  | { kind: "no-directory" }
  | { kind: "no-lock" }
  | { kind: "malformed-lock"; issues: string[] }
  | { kind: "no-examples" }
  | { kind: "modified"; file: string }
  | { kind: "added"; file: string }
  | { kind: "removed"; file: string }
  | { kind: "invalid-example"; file: string; issues: string[] }
  | { kind: "duplicate-id"; id: string; files: string[] };

export type GroundTruthCheck = { ok: true } | { ok: false; failures: GroundTruthFailure[] };

/**
 * Compare the lock with the digests of the files now in the directory.
 * `current` maps file name to digest. Every file other than the lock must appear in the lock.
 */
export function compareLock(lock: unknown, current: Readonly<Record<string, string>>): GroundTruthCheck {
  if (lock === undefined) return { ok: false, failures: [{ kind: "no-lock" }] };
  const parsed = GroundTruthLockSchema.safeParse(lock);
  if (!parsed.success) {
    return {
      ok: false,
      failures: [
        { kind: "malformed-lock", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`) },
      ],
    };
  }
  const locked = parsed.data.files;
  const failures: GroundTruthFailure[] = [];
  for (const file of Object.keys(locked).sort()) {
    if (!(file in current)) failures.push({ kind: "removed", file });
    else if (current[file] !== locked[file]) failures.push({ kind: "modified", file });
  }
  for (const file of Object.keys(current).sort()) {
    if (!(file in locked)) failures.push({ kind: "added", file });
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

/** Validate parsed examples (name -> value) and report schema errors and duplicate ids. */
export function validateExamples(examples: Readonly<Record<string, unknown>>): GroundTruthFailure[] {
  const failures: GroundTruthFailure[] = [];
  const ids = new Map<string, string[]>();
  for (const file of Object.keys(examples).sort()) {
    const p = GroundTruthExampleSchema.safeParse(examples[file]);
    if (!p.success) {
      failures.push({
        kind: "invalid-example",
        file,
        issues: p.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`),
      });
    } else ids.set(p.data.id, [...(ids.get(p.data.id) ?? []), file]);
  }
  for (const [id, files] of [...ids].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (files.length > 1) failures.push({ kind: "duplicate-id", id, files });
  }
  return failures;
}

export function describeFailure(f: GroundTruthFailure): string {
  switch (f.kind) {
    case "no-directory":
      return "ground-truth directory is missing";
    case "no-lock":
      return "ground-truth.lock is missing; the human must run attest";
    case "malformed-lock":
      return `ground-truth.lock is malformed: ${f.issues.join("; ")}`;
    case "no-examples":
      return "no ground-truth examples";
    case "modified":
      return `example modified since attest: ${f.file}`;
    case "added":
      return `file added since attest: ${f.file}`;
    case "removed":
      return `example removed since attest: ${f.file}`;
    case "invalid-example":
      return `invalid example ${f.file}: ${f.issues.join("; ")}`;
    case "duplicate-id":
      return `duplicate example id ${f.id} in ${f.files.join(", ")}`;
  }
}

/** The `ground-truth` gate result for a gate report. */
export function groundTruthGateResult(check: GroundTruthCheck): GateResult {
  if (check.ok) return { id: "ground-truth", status: "pass" };
  const [first] = check.failures;
  const more = check.failures.length - 1;
  return {
    id: "ground-truth",
    status: "fail",
    message: `${first ? describeFailure(first) : "failed"}${more > 0 ? ` (+${more} more)` : ""}`,
  };
}
