// Node-only helpers shared by both apps' tests (and later by the gate runner).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkCitation } from "../citations.js";
import { evaluate } from "../evaluator.js";
import { validateRulePack, type RulePack } from "../model.js";
import { loadSnapshot, type SnapshotLoad } from "./snapshots.js";

export function loadPack(appDir: string): RulePack {
  const raw = JSON.parse(readFileSync(join(appDir, "rules", "pack.json"), "utf8")) as unknown;
  const result = validateRulePack(raw);
  if (!result.ok) throw new Error(`invalid rule pack: ${result.errors.join("; ")}`);
  return result.pack;
}

/** Check every citation against the committed snapshots. Returns one line per failure. */
export function verifyCitations(pack: RulePack, appDir: string): string[] {
  const failures: string[] = [];
  const cache = new Map<string, SnapshotLoad>();
  for (const r of pack.rules) {
    for (const c of r.citations) {
      let loaded = cache.get(c.sourceId);
      if (!loaded) {
        loaded = loadSnapshot(join(appDir, "sources", c.sourceId));
        cache.set(c.sourceId, loaded);
      }
      if (!loaded.ok) {
        const line = `${r.ruleId}@${r.versionId}: snapshot ${c.sourceId} ${loaded.code}`;
        if (!failures.includes(line)) failures.push(line);
        continue;
      }
      const res = checkCitation(c, loaded.snapshot);
      if (!res.ok) failures.push(`${r.ruleId}@${r.versionId}: ${res.code} for "${c.quote.slice(0, 40)}"`);
    }
  }
  return failures;
}

interface Candidate {
  id: string;
  facts: Record<string, unknown>;
  period: string;
  knowledgeDate: string;
  expected?: Record<string, number | boolean | string>;
  expectedCodes?: string[];
}

/** Run an agent-suggested candidates file. Returns one line per mismatch. */
export function runCandidates(pack: RulePack, appDir: string, outputs: string[]): string[] {
  const file = JSON.parse(readFileSync(join(appDir, "ground-truth-candidates", "candidates.json"), "utf8")) as {
    examples: Candidate[];
    unsupported: Candidate[];
  };
  const mismatches: string[] = [];
  for (const ex of file.examples) {
    const res = evaluate(pack, { facts: ex.facts, period: ex.period, knowledgeDate: ex.knowledgeDate, outputs: Object.keys(ex.expected ?? {}) });
    if (res.kind !== "ok") {
      mismatches.push(`${ex.id}: unsupported ${res.reasons.map((r) => `${r.code}(${r.path ?? ""})`).join(",")}`);
      continue;
    }
    for (const [k, want] of Object.entries(ex.expected ?? {})) {
      if (res.values[k] !== want) mismatches.push(`${ex.id}: ${k} expected ${want}, got ${res.values[k]}`);
    }
  }
  for (const ex of file.unsupported) {
    const res = evaluate(pack, { facts: ex.facts, period: ex.period, knowledgeDate: ex.knowledgeDate, outputs });
    if (res.kind !== "unsupported") {
      mismatches.push(`${ex.id}: expected unsupported, got ok`);
      continue;
    }
    const got = res.reasons.map((r) => r.code);
    for (const code of ex.expectedCodes ?? []) if (!got.includes(code)) mismatches.push(`${ex.id}: expected code ${code}, got ${got.join(",")}`);
  }
  return mismatches;
}
