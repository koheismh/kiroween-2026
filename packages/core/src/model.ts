// Rule pack model: Zod envelope + hand-written expression validation.
// The expression tree is validated by `validateExpr` (not Zod) so errors carry a path
// and the recursive shape stays simple.
import { z } from "zod";
import { isIsoDate } from "./dates.js";

export type ISODate = string;
export type Scalar = number | boolean | string;
export type RoundMode = "floor" | "ceil" | "halfUp";

export type Expr =
  | { op: "lit"; value: Scalar }
  | { op: "fact"; path: string }
  | { op: "period" }
  | { op: "ref"; rule: string }
  | { op: "and" | "or" | "add" | "mul" | "min" | "max"; args: Expr[] }
  | { op: "not"; arg: Expr }
  | { op: "eq" | "lt" | "lte" | "gt" | "gte" | "sub"; left: Expr; right: Expr }
  | { op: "inSet"; value: Expr; set: Scalar[] }
  | { op: "mulBps"; value: Expr; bps: Expr; round: RoundMode }
  | { op: "if"; cond: Expr; then: Expr; else: Expr }
  | { op: "lookup"; key: Expr; table: Record<string, Scalar> }
  | { op: "bands"; input: Expr; bands: { upTo: number | null; bps: number }[]; round: RoundMode }
  | { op: "ageOn"; birth: Expr; on: Expr; mode: "completedYears" }
  | { op: "ageOn"; birth: Expr; on: Expr; mode: "throughMarch31After"; age: number }
  | { op: "sumOver"; list: string; as: string; expr: Expr }
  | { op: "countWhere"; list: string; as: string; where: Expr };

const isoDate = z.string().refine(isIsoDate, "must be a valid ISO date YYYY-MM-DD");

const Citation = z
  .object({
    sourceId: z.string().min(1),
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/, "must be a lowercase SHA-256 hex digest"),
    quote: z.string().min(1),
  })
  .strict();

const common = { required: z.boolean().optional() };
const IntegerFact = z
  .object({
    type: z.literal("integer"),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
    values: z.array(z.number().int()).optional(),
    default: z.number().int().optional(),
    ...common,
  })
  .strict();
const BooleanFact = z
  .object({ type: z.literal("boolean"), values: z.array(z.boolean()).optional(), default: z.boolean().optional(), ...common })
  .strict();
const StringFact = z
  .object({ type: z.literal("string"), values: z.array(z.string()).optional(), default: z.string().optional(), ...common })
  .strict();
const DateFact = z
  .object({
    type: z.literal("date"),
    min: isoDate.optional(),
    max: isoDate.optional(),
    excludeMonthDays: z.array(z.string().regex(/^\d{2}-\d{2}$/)).optional(),
    ...common,
  })
  .strict();
const ScalarFact = z.discriminatedUnion("type", [IntegerFact, BooleanFact, StringFact, DateFact]);
const ArrayFact = z
  .object({
    type: z.literal("array"),
    minItems: z.number().int().min(0).optional(),
    maxItems: z.number().int().min(0),
    uniqueBy: z.string().optional(),
    item: z.record(z.string(), ScalarFact),
    ...common,
  })
  .strict();
const FactSpec = z.discriminatedUnion("type", [IntegerFact, BooleanFact, StringFact, DateFact, ArrayFact]);

const Scope = z
  .object({
    period: z
      .object({ min: isoDate.optional(), max: isoDate.optional(), dayOfMonth: z.number().int().min(1).max(31).optional() })
      .strict()
      .optional(),
    facts: z.record(z.string(), FactSpec),
    assumptions: z.array(z.string()).optional(),
  })
  .strict();

const RuleVersion = z
  .object({
    ruleId: z.string().min(1),
    versionId: z.string().min(1),
    appliesFrom: isoDate,
    appliesTo: isoDate.optional(),
    knownFrom: isoDate,
    knownFromBasis: z.enum(["enactment", "publication", "snapshot-upper-bound"]),
    citations: z.array(Citation).min(1),
    expr: z.custom<Expr>((v) => typeof v === "object" && v !== null && !Array.isArray(v), "must be an expression object"),
  })
  .strict();

export const RulePackSchema = z
  .object({
    appId: z.string().min(1),
    schemaVersion: z.literal(1),
    scope: Scope,
    rules: z.array(RuleVersion).min(1),
  })
  .strict();

export type RulePack = z.infer<typeof RulePackSchema>;
export type RuleVersionT = RulePack["rules"][number];
export type ScopeDecl = RulePack["scope"];
export type FactSpecT = z.infer<typeof FactSpec>;
export type ScalarFactSpec = z.infer<typeof ScalarFact>;
export type CitationT = z.infer<typeof Citation>;

export type PackValidation = { ok: true; pack: RulePack } | { ok: false; errors: string[] };

const ROUND = new Set(["floor", "ceil", "halfUp"]);
const SCALAR = (v: unknown): v is Scalar => typeof v === "string" || typeof v === "boolean" || Number.isInteger(v);

/** Validate one expression tree. Pushes errors with a path and collects `ref` targets. */
export function validateExpr(e: unknown, path: string, errors: string[], refs: Set<string>): void {
  if (typeof e !== "object" || e === null || Array.isArray(e)) {
    errors.push(`${path}: expression must be an object`);
    return;
  }
  const x = e as Record<string, unknown>;
  const sub = (k: string, v: unknown) => validateExpr(v, `${path}.${k}`, errors, refs);
  const list = (k: string, min = 1) => {
    const v = x[k];
    if (!Array.isArray(v) || v.length < min) errors.push(`${path}.${k}: must be an array with at least ${min} item(s)`);
    else v.forEach((a, i) => validateExpr(a, `${path}.${k}[${i}]`, errors, refs));
  };
  const str = (k: string) => {
    if (typeof x[k] !== "string" || x[k] === "") errors.push(`${path}.${k}: must be a non-empty string`);
  };
  const round = () => {
    if (!ROUND.has(x["round"] as string)) errors.push(`${path}.round: must be floor, ceil, or halfUp`);
  };
  switch (x["op"]) {
    case "lit":
      if (!SCALAR(x["value"])) errors.push(`${path}.value: must be an integer, boolean, or string (no floating-point numbers)`);
      break;
    case "fact":
      str("path");
      break;
    case "period":
      break;
    case "ref":
      str("rule");
      if (typeof x["rule"] === "string") refs.add(x["rule"]);
      break;
    case "and":
    case "or":
    case "add":
    case "mul":
    case "min":
    case "max":
      list("args");
      break;
    case "not":
      sub("arg", x["arg"]);
      break;
    case "eq":
    case "lt":
    case "lte":
    case "gt":
    case "gte":
    case "sub":
      sub("left", x["left"]);
      sub("right", x["right"]);
      break;
    case "inSet":
      sub("value", x["value"]);
      if (!Array.isArray(x["set"]) || !x["set"].every(SCALAR)) errors.push(`${path}.set: must be an array of integers, booleans, or strings`);
      break;
    case "mulBps":
      sub("value", x["value"]);
      sub("bps", x["bps"]);
      round();
      break;
    case "if":
      sub("cond", x["cond"]);
      sub("then", x["then"]);
      sub("else", x["else"]);
      break;
    case "lookup": {
      sub("key", x["key"]);
      const t = x["table"];
      if (typeof t !== "object" || t === null || Array.isArray(t) || !Object.values(t).every(SCALAR)) {
        errors.push(`${path}.table: must be an object of integer, boolean, or string values`);
      }
      break;
    }
    case "bands": {
      sub("input", x["input"]);
      round();
      const b = x["bands"];
      if (!Array.isArray(b) || b.length === 0) {
        errors.push(`${path}.bands: must be a non-empty array`);
        break;
      }
      let prev = -1;
      b.forEach((band: { upTo?: unknown; bps?: unknown }, i: number) => {
        const last = i === b.length - 1;
        if (!Number.isInteger(band?.bps)) errors.push(`${path}.bands[${i}].bps: must be an integer`);
        if (last) {
          if (band?.upTo !== null) errors.push(`${path}.bands[${i}].upTo: the last band must have upTo null`);
        } else if (!Number.isInteger(band?.upTo) || (band.upTo as number) <= prev) {
          errors.push(`${path}.bands[${i}].upTo: must be an integer greater than the previous band`);
        } else {
          prev = band.upTo as number;
        }
      });
      break;
    }
    case "ageOn":
      sub("birth", x["birth"]);
      sub("on", x["on"]);
      if (x["mode"] === "throughMarch31After") {
        if (!Number.isInteger(x["age"]) || (x["age"] as number) < 0) errors.push(`${path}.age: must be a non-negative integer`);
      } else if (x["mode"] !== "completedYears") {
        errors.push(`${path}.mode: must be completedYears or throughMarch31After`);
      }
      break;
    case "sumOver":
      str("list");
      str("as");
      sub("expr", x["expr"]);
      break;
    case "countWhere":
      str("list");
      str("as");
      sub("where", x["where"]);
      break;
    default:
      errors.push(`${path}.op: unknown operator ${JSON.stringify(x["op"])}`);
  }
}

/** Validate a rule pack: schema, expressions, references, cycles, overlaps. */
export function validateRulePack(input: unknown): PackValidation {
  const parsed = RulePackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const pack = parsed.data;
  const errors: string[] = [];
  const edges = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const byRule = new Map<string, RuleVersionT[]>();

  pack.rules.forEach((r, i) => {
    const where = `rules[${i}] (${r.ruleId}@${r.versionId})`;
    const key = `${r.ruleId}@${r.versionId}`;
    if (seen.has(key)) errors.push(`${where}: duplicate ruleId@versionId`);
    seen.add(key);
    if (r.appliesTo !== undefined && r.appliesTo < r.appliesFrom) errors.push(`${where}: appliesTo is before appliesFrom`);
    const refs = new Set<string>();
    validateExpr(r.expr, `${where}.expr`, errors, refs);
    const set = edges.get(r.ruleId) ?? new Set<string>();
    refs.forEach((t) => set.add(t));
    edges.set(r.ruleId, set);
    byRule.set(r.ruleId, [...(byRule.get(r.ruleId) ?? []), r]);
  });

  for (const [from, targets] of edges) {
    for (const t of targets) if (!byRule.has(t)) errors.push(`rule ${from}: ref to unknown rule ${t}`);
  }

  // Cycle detection over rule ids (union of all versions).
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, stack: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`reference cycle: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const t of edges.get(id) ?? []) if (byRule.has(t)) visit(t, [...stack, id]);
    state.set(id, 2);
  };
  for (const id of byRule.keys()) visit(id, []);

  // Two versions of one rule with the same knownFrom must not overlap in period.
  for (const [id, vs] of byRule) {
    for (let a = 0; a < vs.length; a++) {
      for (let b = a + 1; b < vs.length; b++) {
        const x = vs[a] as RuleVersionT;
        const y = vs[b] as RuleVersionT;
        if (x.knownFrom !== y.knownFrom) continue;
        const overlap = x.appliesFrom <= (y.appliesTo ?? "9999-12-31") && y.appliesFrom <= (x.appliesTo ?? "9999-12-31");
        if (overlap) errors.push(`rule ${id}: versions ${x.versionId} and ${y.versionId} share knownFrom ${x.knownFrom} and overlap in period`);
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, pack };
}
