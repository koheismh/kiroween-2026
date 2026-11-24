import { describe, expect, it } from "vitest";
import { completedYears, throughMarch31After } from "./dates.js";
import { divRound, evaluate } from "./evaluator.js";
import { validateRulePack, type Expr, type RulePack } from "./model.js";
import { resolveVersion } from "./temporal.js";

const H = "c".repeat(64);
const cit = [{ sourceId: "s", snapshotSha256: H, quote: "a quote long enough" }];
const v = (ruleId: string, versionId: string, expr: Expr, extra: Record<string, unknown> = {}) => ({
  ruleId,
  versionId,
  appliesFrom: "2025-01-01",
  appliesTo: "2025-12-31",
  knownFrom: "2024-11-04",
  knownFromBasis: "publication",
  citations: cit,
  expr,
  ...extra,
});
const lit = (value: number | boolean | string): Expr => ({ op: "lit", value });
const pack = (rules: unknown[], facts: Record<string, unknown> = { wages: { type: "integer", min: 0 } }): unknown => ({
  appId: "t",
  schemaVersion: 1,
  scope: { period: { min: "2025-01-01", max: "2025-12-31" }, facts },
  rules,
});
const must = (input: unknown): RulePack => {
  const r = validateRulePack(input);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.pack;
};

describe("dates", () => {
  it("computes completed years and school-year end", () => {
    expect(completedYears("2020-06-15", "2023-06-14")).toBe(2);
    expect(completedYears("2020-06-15", "2023-06-15")).toBe(3);
    // 15th birthday 2023-06-06 -> first March 31 after is 2024-03-31
    expect(throughMarch31After("2008-06-06", "2024-03-31", 15)).toBe(true);
    expect(throughMarch31After("2008-06-06", "2024-04-01", 15)).toBe(false);
    // January birthday: 15th birthday 2023-01-10 -> March 31 2023
    expect(throughMarch31After("2008-01-10", "2023-03-31", 15)).toBe(true);
    expect(throughMarch31After("2008-01-10", "2023-04-01", 15)).toBe(false);
  });
});

describe("divRound", () => {
  it("rounds with an explicit mode", () => {
    expect(divRound(25, 10, "floor")).toBe(2);
    expect(divRound(25, 10, "ceil")).toBe(3);
    expect(divRound(25, 10, "halfUp")).toBe(3);
    expect(divRound(24, 10, "halfUp")).toBe(2);
    expect(divRound(-25, 10, "floor")).toBe(-3);
  });
});

describe("validateRulePack", () => {
  it("accepts a minimal pack", () => {
    expect(validateRulePack(pack([v("a", "1", lit(1))])).ok).toBe(true);
  });
  const errorsOf = (rules: unknown[]) => {
    const r = validateRulePack(pack(rules));
    return r.ok ? [] : r.errors.join("\n");
  };
  it("rejects floating-point numbers", () => {
    expect(errorsOf([v("a", "1", { op: "lit", value: 1.5 })])).toContain("no floating-point");
  });
  it("rejects unknown operators", () => {
    expect(errorsOf([v("a", "1", { op: "nope" } as unknown as Expr)])).toContain("unknown operator");
  });
  it("rejects reference cycles and unknown refs", () => {
    const cycle = errorsOf([v("a", "1", { op: "ref", rule: "b" }), v("b", "1", { op: "ref", rule: "a" })]);
    expect(cycle).toContain("reference cycle");
    expect(errorsOf([v("a", "1", { op: "ref", rule: "zzz" })])).toContain("unknown rule zzz");
  });
  it("rejects same-knownFrom overlapping versions", () => {
    expect(errorsOf([v("a", "1", lit(1)), v("a", "2", lit(2))])).toContain("share knownFrom");
  });
  it("accepts overlapping versions with different knownFrom", () => {
    expect(validateRulePack(pack([v("a", "1", lit(1)), v("a", "2", lit(2), { knownFrom: "2025-07-04" })])).ok).toBe(true);
  });
  it("requires at least one citation", () => {
    expect(errorsOf([v("a", "1", lit(1), { citations: [] })])).toContain("citations");
  });
  it("rejects malformed bands", () => {
    const bad: Expr = { op: "bands", input: lit(1), round: "floor", bands: [{ upTo: 10, bps: 1000 }] };
    expect(errorsOf([v("a", "1", bad)])).toContain("last band");
  });
});

describe("resolveVersion (temporal)", () => {
  const p = must(
    pack([
      v("sd", "orig", lit(1500000)),
      v("sd", "rev", lit(1575000), { knownFrom: "2025-07-04", knownFromBasis: "enactment" }),
    ]),
  );
  const versions = p.rules.filter((r) => r.ruleId === "sd");
  it("keeps the original before the revision is known", () => {
    expect(resolveVersion(versions, "2025-12-31", "2025-06-30")?.versionId).toBe("orig");
  });
  it("uses the revision once known", () => {
    expect(resolveVersion(versions, "2025-12-31", "2025-07-04")?.versionId).toBe("rev");
    expect(resolveVersion(versions, "2025-12-31", "2025-12-31")?.versionId).toBe("rev");
  });
  it("returns nothing before anything is known or outside the period", () => {
    expect(resolveVersion(versions, "2025-12-31", "2024-01-01")).toBeUndefined();
    expect(resolveVersion(versions, "2026-01-01", "2026-01-01")).toBeUndefined();
  });
});

describe("evaluate", () => {
  const rules = [
    v("sd", "orig", lit(1500000)),
    v("sd", "rev", lit(1575000), { knownFrom: "2025-07-04", knownFromBasis: "enactment" }),
    v("tax", "1", {
      op: "bands",
      round: "halfUp",
      input: { op: "sub", left: { op: "fact", path: "wages" }, right: { op: "ref", rule: "sd" } },
      bands: [
        { upTo: 1192500, bps: 1000 },
        { upTo: 4847500, bps: 1200 },
        { upTo: null, bps: 2200 },
      ],
    }),
  ];
  const p = must(pack(rules));
  const run = (wages: number, knowledgeDate: string) =>
    evaluate(p, { facts: { wages }, period: "2025-12-31", knowledgeDate, outputs: ["sd", "tax"] });

  it("reproduces the historical estimate and the revised one", () => {
    const before = run(5000000, "2025-06-30");
    const after = run(5000000, "2025-12-31");
    expect(before.kind === "ok" && before.values).toEqual({ sd: 1500000, tax: 396150 });
    expect(after.kind === "ok" && after.values).toEqual({ sd: 1575000, tax: 387150 });
  });
  it("includes citations in the trace", () => {
    const r = run(5000000, "2025-12-31");
    expect(r.kind === "ok" && r.trace.map((t) => `${t.ruleId}@${t.versionId}`).sort()).toEqual(["sd@rev", "tax@1"]);
    expect(r.kind === "ok" && r.trace[0]?.citations[0]?.sourceId).toBe("s");
  });
  it("is deterministic", () => {
    expect(run(5000000, "2025-12-31")).toEqual(run(5000000, "2025-12-31"));
  });
  it("returns unsupported, never a number, outside the scope", () => {
    const bad = evaluate(p, { facts: { wages: -5 }, period: "2024-12-31", knowledgeDate: "2025-12-31", outputs: ["tax"] });
    expect(bad.kind).toBe("unsupported");
    expect(bad).not.toHaveProperty("values");
    const codes = bad.kind === "unsupported" ? bad.reasons.map((r) => r.code).sort() : [];
    expect(codes).toEqual(["FACT_OUT_OF_SCOPE", "PERIOD_OUT_OF_SCOPE"]);
  });
  it("flags missing and unknown facts", () => {
    const r = evaluate(p, { facts: { extra: 1 }, period: "2025-12-31", knowledgeDate: "2025-12-31", outputs: ["tax"] });
    expect(r.kind === "unsupported" && r.reasons.map((x) => x.code).sort()).toEqual(["MISSING_FACT", "UNKNOWN_FACT"]);
  });
  it("returns NO_RULE_FOR_PERIOD when nothing was knowable yet", () => {
    const r = evaluate(p, { facts: { wages: 1 }, period: "2025-12-31", knowledgeDate: "2024-01-01", outputs: ["sd"] });
    expect(r.kind === "unsupported" && r.reasons[0]?.code).toBe("NO_RULE_FOR_PERIOD");
  });
  it("supports lists, sums, counts, and lookups", () => {
    const listPack = must(
      pack(
        [
          v("total", "1", {
            op: "sumOver",
            list: "items",
            as: "i",
            expr: {
              op: "add",
              args: [
                { op: "lookup", key: { op: "fact", path: "$i.kind" }, table: { a: 10, b: 20 } },
                { op: "countWhere", list: "items", as: "o", where: { op: "lt", left: { op: "fact", path: "$o.n" }, right: { op: "fact", path: "$i.n" } } },
              ],
            },
          }),
        ],
        {
          items: {
            type: "array",
            maxItems: 3,
            uniqueBy: "n",
            item: { kind: { type: "string", values: ["a", "b"] }, n: { type: "integer" } },
          },
        },
      ),
    );
    const items = [
      { kind: "a", n: 1 },
      { kind: "b", n: 2 },
      { kind: "a", n: 3 },
    ];
    const r = evaluate(listPack, { facts: { items }, period: "2025-06-01", knowledgeDate: "2025-06-01", outputs: ["total"] });
    // lookups 10+20+10 = 40; counts of smaller n: 0+1+2 = 3
    expect(r.kind === "ok" && r.values["total"]).toBe(43);
    const dup = evaluate(listPack, { facts: { items: [items[0], items[0]] }, period: "2025-06-01", knowledgeDate: "2025-06-01", outputs: ["total"] });
    expect(dup.kind === "unsupported" && dup.reasons.map((x) => x.code)).toContain("DUPLICATE_ITEM");
  });
});
