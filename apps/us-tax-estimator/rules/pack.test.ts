import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPack, runCandidates, verifyCitations } from "../../../packages/core/src/node/pack-files.js";

const appDir = fileURLToPath(new URL("..", import.meta.url));

describe("us-tax-estimator rule pack", () => {
  const pack = loadPack(appDir);
  it("validates", () => {
    expect(pack.appId).toBe("us-tax-estimator");
  });
  it("has every citation verified against the committed snapshots", () => {
    expect(verifyCitations(pack, appDir)).toEqual([]);
  });
  // Smoke check only: the candidates are agent-suggested and are not attested ground truth.
  it("agrees with the agent-suggested candidates", () => {
    expect(runCandidates(pack, appDir, ["standardDeductionCents", "incomeTaxCents"])).toEqual([]);
  });
});
