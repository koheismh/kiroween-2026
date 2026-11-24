import type { RuleVersionT } from "./model.js";

/**
 * Pick the version of one rule that governs `period` given what was knowable on
 * `knowledgeDate`: among versions that cover `period` and have `knownFrom <= knowledgeDate`,
 * the one with the latest `knownFrom`. A version without `appliesTo` is open-ended, so a
 * newer-known version supersedes it only from the moment it becomes known.
 */
export function resolveVersion(versions: RuleVersionT[], period: string, knowledgeDate: string): RuleVersionT | undefined {
  let best: RuleVersionT | undefined;
  for (const v of versions) {
    if (v.appliesFrom > period) continue;
    if (v.appliesTo !== undefined && v.appliesTo < period) continue;
    if (v.knownFrom > knowledgeDate) continue;
    if (best === undefined || v.knownFrom > best.knownFrom) best = v;
  }
  return best;
}
