// Regression tests for the ground-truth example schema (task 7.2.1). In-memory data only.
import { describe, expect, it } from "vitest";
import { GroundTruthExampleSchema, validateExamples } from "./groundtruth.js";

const base = {
  id: "x",
  sourceId: "s",
  locator: "sec 1",
  period: "2025-12-31",
  knowledgeDate: "2025-12-31",
  attester: "dev",
};
const us = { ...base, facts: { wagesCents: 5000000, filingStatus: "single", blind: false }, expected: { incomeTaxCents: 387150 } };
const jp = {
  ...base,
  facts: { recipientIncomeYen: 5000000, children: [{ birthDate: "2022-05-10", note: null }] },
  expected: { monthlyAllowanceYen: 15000, schedule: [2, 4, 6] },
};
const ok = (v: unknown) => GroundTruthExampleSchema.safeParse(v).success;

describe("ground-truth example schema", () => {
  it("accepts US flat facts", () => expect(ok(us)).toBe(true));
  it("accepts JP nested array/object facts and null", () => expect(ok(jp)).toBe(true));
  it("rejects floats at any depth in facts", () => {
    expect(ok({ ...us, facts: { rate: 0.5 } })).toBe(false);
    expect(ok({ ...jp, facts: { children: [{ weight: 1.5 }] } })).toBe(false);
  });
  it("rejects floats in expected, including nested", () => {
    expect(ok({ ...us, expected: { rate: 0.5 } })).toBe(false);
    expect(ok({ ...jp, expected: { a: [1, 2.5] } })).toBe(false);
  });
  it("rejects non-JSON values", () => {
    expect(ok({ ...us, facts: { n: Number.NaN } })).toBe(false);
    expect(ok({ ...us, facts: { n: undefined } })).toBe(false);
  });
  it("rejects empty expected", () => {
    expect(ok({ ...us, expected: {} })).toBe(false);
    expect(validateExamples({ "a.json": { ...jp, expected: {} } })[0]).toMatchObject({
      kind: "invalid-example",
      file: "a.json",
    });
  });
  it("still rejects unknown keys and bad dates", () => {
    expect(ok({ ...us, extra: 1 })).toBe(false);
    expect(ok({ ...us, period: "2025-13-01" })).toBe(false);
  });
});
