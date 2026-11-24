import { describe, expect, it } from "vitest";
import { REQUIRED_GATES, checkGateReport, type GateReport } from "./gates.js";

const D1 = "a".repeat(64);
const D2 = "b".repeat(64);

function report(over: Partial<GateReport> = {}): GateReport {
  return {
    schemaVersion: 1,
    packDigest: D1,
    gates: REQUIRED_GATES.map((id) => ({ id, status: "pass" as const })),
    ...over,
  };
}

describe("checkGateReport", () => {
  it("accepts a report bound to the digest with all required gates passing", () => {
    expect(checkGateReport(report(), D1)).toEqual({ ok: true });
  });

  it("ignores extra gates", () => {
    const r = report();
    r.gates.push({ id: "extra", status: "fail" });
    expect(checkGateReport(r, D1)).toEqual({ ok: true });
  });

  it("reports a failed required gate", () => {
    const r = report();
    r.gates[1] = { id: "citations", status: "fail", message: "quote not found" };
    expect(checkGateReport(r, D1)).toEqual({ ok: false, failures: [{ kind: "failed", gateIds: ["citations"] }] });
  });

  it("treats a missing required gate as failing, reported as missing", () => {
    const r = report({ gates: report().gates.filter((g) => g.id !== "ground-truth") });
    expect(checkGateReport(r, D1)).toEqual({ ok: false, failures: [{ kind: "missing", gateIds: ["ground-truth"] }] });
  });

  it("reports a report bound to a different pack digest as stale", () => {
    expect(checkGateReport(report({ packDigest: D2 }), D1)).toEqual({
      ok: false,
      failures: [{ kind: "stale", reportDigest: D2, packDigest: D1 }],
    });
  });

  it("reports all problems together", () => {
    const r = report({ packDigest: D2, gates: [{ id: "schema", status: "fail" }] });
    const res = checkGateReport(r, D1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((f) => f.kind)).toEqual(["stale", "missing", "failed"]);
  });

  it("rejects a required gate listed twice, even if one entry passes", () => {
    const r = report();
    r.gates.push({ id: "schema", status: "fail" });
    const res = checkGateReport(r, D1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((f) => f.kind)).toEqual(["failed", "duplicate"]);
  });

  it("returns malformed for non-conforming input and never throws", () => {
    for (const bad of [null, "x", {}, { ...report(), packDigest: "ABC" }, { ...report(), extra: 1 }]) {
      const res = checkGateReport(bad, D1);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.failures[0]?.kind).toBe("malformed");
    }
  });

  it("uses the skeleton list by default; the report cannot shrink it", () => {
    expect(checkGateReport(report({ gates: [] }), D1)).toEqual({
      ok: false,
      failures: [{ kind: "missing", gateIds: [...REQUIRED_GATES] }],
    });
  });
});
