// Tamper detection for the ground-truth lock (task 7.1). Temp directories only; the real
// apps/*/ground-truth/ directories are never touched.
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { groundTruthGateResult, type GroundTruthExample } from "../groundtruth.js";
import { appPath } from "./approval-files.js";
import { runCli, type CliIo } from "./cli.js";
import { attestGroundTruth, checkGroundTruth, groundTruthDir } from "./groundtruth-files.js";

let app: string;

const ex = (id: string, over: Partial<GroundTruthExample> = {}): GroundTruthExample => ({
  id,
  sourceId: "src-1",
  locator: "table 1",
  period: "2025-06-01",
  knowledgeDate: "2025-06-01",
  facts: { income: 5000000 },
  expected: { tax: 123 },
  attester: "human",
  ...over,
});

function put(name: string, v: unknown, dir = groundTruthDir(app)): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), typeof v === "string" ? v : JSON.stringify(v, null, 2));
}

function kinds(): string[] {
  const r = checkGroundTruth(app);
  return r.ok ? [] : r.failures.map((f) => f.kind);
}

beforeEach(() => {
  app = mkdtempSync(join(tmpdir(), "changeling-gt-"));
  put("a.json", ex("a"));
  put("b.json", ex("b"));
});
afterEach(() => rmSync(app, { recursive: true, force: true }));

describe("ground-truth gate", () => {
  it("fails with no-lock before attest, passes after", () => {
    expect(kinds()).toEqual(["no-lock"]);
    expect(attestGroundTruth(app)).toMatchObject({ ok: true, count: 2 });
    expect(checkGroundTruth(app)).toEqual({ ok: true });
    expect(groundTruthGateResult(checkGroundTruth(app))).toEqual({ id: "ground-truth", status: "pass" });
  });

  it("fails when the lock is deleted", () => {
    attestGroundTruth(app);
    unlinkSync(appPath(app, "lock"));
    expect(kinds()).toEqual(["no-lock"]);
  });

  it("fails on a malformed or unparseable lock", () => {
    attestGroundTruth(app);
    writeFileSync(appPath(app, "lock"), "{ not json");
    expect(kinds()).toEqual(["malformed-lock"]);
    writeFileSync(appPath(app, "lock"), JSON.stringify({ files: {} }));
    expect(kinds()).toContain("malformed-lock");
  });

  it("detects a modified example", () => {
    attestGroundTruth(app);
    put("a.json", ex("a", { expected: { tax: 124 } }));
    const r = checkGroundTruth(app);
    expect(r).toEqual({ ok: false, failures: [{ kind: "modified", file: "a.json" }] });
    expect(groundTruthGateResult(r)).toMatchObject({ status: "fail", message: expect.stringContaining("a.json") });
  });

  it("ignores formatting-only changes (canonical digest)", () => {
    attestGroundTruth(app);
    put("a.json", JSON.stringify(ex("a")));
    expect(checkGroundTruth(app)).toEqual({ ok: true });
  });

  it("detects an added example", () => {
    attestGroundTruth(app);
    put("c.json", ex("c"));
    expect(checkGroundTruth(app)).toEqual({ ok: false, failures: [{ kind: "added", file: "c.json" }] });
  });

  it("detects an added non-JSON file", () => {
    attestGroundTruth(app);
    put("notes.txt", "hi");
    expect(kinds()).toContain("added");
  });

  it("detects a removed example", () => {
    attestGroundTruth(app);
    unlinkSync(join(groundTruthDir(app), "b.json"));
    expect(checkGroundTruth(app)).toEqual({ ok: false, failures: [{ kind: "removed", file: "b.json" }] });
  });

  it("fails when the directory is missing", () => {
    rmSync(groundTruthDir(app), { recursive: true });
    expect(kinds()).toEqual(["no-directory"]);
  });

  it("never reads ground-truth-candidates", () => {
    attestGroundTruth(app);
    const cand = join(app, "ground-truth-candidates");
    put("x.json", ex("x"), cand);
    put("candidates.json", { anything: 1.5 }, cand);
    expect(checkGroundTruth(app)).toEqual({ ok: true });
    // Candidates do not make an otherwise empty ground-truth directory acceptable either.
    rmSync(groundTruthDir(app), { recursive: true });
    mkdirSync(groundTruthDir(app));
    expect(attestGroundTruth(app)).toEqual({ ok: false, failures: [{ kind: "no-examples" }] });
  });
});

describe("attest", () => {
  it("refuses invalid examples, duplicate ids, and floats", () => {
    put("bad.json", { id: "bad" });
    put("dup.json", ex("a"));
    put("float.json", ex("f", { expected: { rate: 0.5 } as never }));
    const r = attestGroundTruth(app);
    expect(r.ok).toBe(false);
    const k = r.ok ? [] : r.failures.map((f) => f.kind);
    expect(k).toContain("invalid-example");
    expect(k).toContain("duplicate-id");
    expect(() => checkGroundTruth(app)).not.toThrow();
  });

  it("CLI attest writes the lock and reports refusal with exit 1", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = {
      out: (l) => out.push(l),
      err: (l) => err.push(l),
      env: {},
      home: app,
      today: () => "2025-01-01",
      promptSecret: () => Promise.reject(new Error("no prompt")),
    };
    expect(await runCli(["attest", "--app", app], io)).toBe(0);
    expect(checkGroundTruth(app)).toEqual({ ok: true });
    put("bad.json", "{");
    expect(await runCli(["attest", "--app", app], io)).toBe(1);
    expect(err.join("\n")).toContain("REFUSED");
  });
});
