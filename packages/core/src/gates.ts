// Gate report format and the skeleton-declared required-gate list (task 6.2, R5.5, R5.6).
// Pure and environment-neutral. Computing digests is the caller's job (see node/signing.ts).
import { z } from "zod";

/**
 * Gates every pack must pass before approval. Declared here by the skeleton; a proposal or
 * a gate report cannot add to, remove from, or reorder this list.
 */
export const REQUIRED_GATES = ["schema", "citations", "ground-truth"] as const;
export type RequiredGateId = (typeof REQUIRED_GATES)[number];

const HEX64 = /^[0-9a-f]{64}$/;

export const GateResultSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["pass", "fail"]),
    /** Short human-readable detail, for example the first failure message. */
    message: z.string().optional(),
  })
  .strict();
export type GateResult = z.infer<typeof GateResultSchema>;

export const GateReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** SHA-256 hex of the canonical pack this report was produced for. */
    packDigest: z.string().regex(HEX64),
    gates: z.array(GateResultSchema),
  })
  .strict();
export type GateReport = z.infer<typeof GateReportSchema>;

export type GateCheckFailure =
  | { kind: "malformed"; issues: string[] }
  | { kind: "stale"; reportDigest: string; packDigest: string }
  | { kind: "missing"; gateIds: string[] }
  | { kind: "failed"; gateIds: string[] }
  | { kind: "duplicate"; gateIds: string[] };

export type GateCheckResult = { ok: true } | { ok: false; failures: GateCheckFailure[] };

/**
 * Check a gate report against the current pack digest and the required-gate list.
 * Ok only when the report is well formed, bound to `packDigest`, and every required gate
 * appears exactly once with status "pass". A missing required gate counts as failed.
 * Extra gates in the report are allowed and do not affect the outcome.
 */
export function checkGateReport(
  report: unknown,
  packDigest: string,
  required: readonly string[] = REQUIRED_GATES,
): GateCheckResult {
  const parsed = GateReportSchema.safeParse(report);
  if (!parsed.success) {
    return {
      ok: false,
      failures: [
        { kind: "malformed", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`) },
      ],
    };
  }
  const r = parsed.data;
  const failures: GateCheckFailure[] = [];

  if (r.packDigest !== packDigest) {
    failures.push({ kind: "stale", reportDigest: r.packDigest, packDigest });
  }

  const byId = new Map<string, GateResult[]>();
  for (const g of r.gates) byId.set(g.id, [...(byId.get(g.id) ?? []), g]);

  const duplicate = required.filter((id) => (byId.get(id)?.length ?? 0) > 1);
  const missing = required.filter((id) => !byId.has(id));
  const failed = required.filter((id) => {
    const results = byId.get(id);
    return results !== undefined && results.some((g) => g.status !== "pass");
  });

  if (missing.length > 0) failures.push({ kind: "missing", gateIds: missing });
  if (failed.length > 0) failures.push({ kind: "failed", gateIds: failed });
  if (duplicate.length > 0) failures.push({ kind: "duplicate", gateIds: duplicate });

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
