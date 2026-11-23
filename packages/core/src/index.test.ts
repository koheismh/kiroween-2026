import { describe, expect, it } from "vitest";
import { RULE_PACK_SCHEMA_VERSION } from "./index.js";

describe("scaffold", () => {
  it("exposes the rule pack schema version", () => {
    expect(RULE_PACK_SCHEMA_VERSION).toBe(1);
  });
});
