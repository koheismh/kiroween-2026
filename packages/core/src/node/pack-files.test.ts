import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPack, runCandidates, verifyCitations } from "./pack-files.js";

const jpDir = fileURLToPath(new URL("../../../../apps/jp-child-allowance/", import.meta.url));

describe("pack file harness catches problems", () => {
  it("reports a citation whose quote was altered", () => {
    const pack = structuredClone(loadPack(jpDir));
    const c = pack.rules.find((r) => r.ruleId === "paymentsPerYear")?.citations[0];
    if (!c) throw new Error("fixture missing");
    c.quote = c.quote.replace("6月", "7月");
    expect(verifyCitations(pack, jpDir)).toHaveLength(1);
  });
  it("reports a wrong rule value against the candidates", () => {
    const pack = structuredClone(loadPack(jpDir));
    const post = pack.rules.find((r) => r.ruleId === "paymentsPerYear" && r.versionId === "post-2024-10");
    if (!post) throw new Error("fixture missing");
    post.expr = { op: "lit", value: 5 };
    expect(runCandidates(pack, jpDir, ["monthlyAllowanceYen"]).join("\n")).toContain("paymentsPerYear expected 6, got 5");
  });
});
