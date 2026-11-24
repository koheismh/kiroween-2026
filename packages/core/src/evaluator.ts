// Deterministic evaluator. Pure function of (pack, facts, period, knowledgeDate).
// It never reads the clock, network, or randomness, and it never returns a number
// together with an unsupported reason.
import { completedYears, isIsoDate, monthDay, throughMarch31After } from "./dates.js";
import type { CitationT, Expr, RoundMode, RulePack, RuleVersionT, ScalarFactSpec, Scalar } from "./model.js";
import { resolveVersion } from "./temporal.js";

export interface Reason {
  code: string;
  path?: string;
  message: string;
}

export interface TraceEntry {
  ruleId: string;
  versionId: string;
  knownFrom: string;
  knownFromBasis: string;
  citations: CitationT[];
}

export type EvalResult =
  | { kind: "ok"; values: Record<string, Scalar>; trace: TraceEntry[] }
  | { kind: "unsupported"; reasons: Reason[] };

export interface EvalInput {
  facts: Record<string, unknown>;
  period: string;
  knowledgeDate: string;
  /** Rule ids to compute. */
  outputs: string[];
}

class Unsupported extends Error {
  constructor(readonly reasons: Reason[]) {
    super(reasons.map((r) => r.code).join(","));
  }
}
const stop = (code: string, message: string, path?: string): never => {
  throw new Unsupported([path === undefined ? { code, message } : { code, message, path }]);
};

/** Integer division with an explicit rounding mode. Ties round up for halfUp. */
export function divRound(n: number, d: number, mode: RoundMode): number {
  let q = Math.floor(n / d);
  let r = n - q * d;
  while (r < 0) {
    q -= 1;
    r += d;
  }
  while (r >= d) {
    q += 1;
    r -= d;
  }
  if (r === 0 || mode === "floor") return q;
  if (mode === "ceil") return q + 1;
  return r * 2 >= d ? q + 1 : q;
}

type Obj = Record<string, unknown>;

// ---- scope check -------------------------------------------------------------

function checkScalar(spec: ScalarFactSpec, v: unknown, path: string, out: Reason[]): boolean {
  const bad = (code: string, message: string) => {
    out.push({ code, path, message });
    return false;
  };
  switch (spec.type) {
    case "integer":
      if (typeof v !== "number" || !Number.isInteger(v)) return bad("INVALID_FACT_TYPE", "expected an integer");
      if (spec.min !== undefined && v < spec.min) return bad("FACT_OUT_OF_SCOPE", `must be at least ${spec.min}`);
      if (spec.max !== undefined && v > spec.max) return bad("FACT_OUT_OF_SCOPE", `must be at most ${spec.max}`);
      if (spec.values && !spec.values.includes(v)) return bad("FACT_OUT_OF_SCOPE", `must be one of ${spec.values.join(", ")}`);
      return true;
    case "boolean":
      if (typeof v !== "boolean") return bad("INVALID_FACT_TYPE", "expected true or false");
      if (spec.values && !spec.values.includes(v)) return bad("FACT_OUT_OF_SCOPE", `must be one of ${spec.values.join(", ")}`);
      return true;
    case "string":
      if (typeof v !== "string") return bad("INVALID_FACT_TYPE", "expected a string");
      if (spec.values && !spec.values.includes(v)) return bad("FACT_OUT_OF_SCOPE", `must be one of ${spec.values.join(", ")}`);
      return true;
    case "date":
      if (!isIsoDate(v)) return bad("INVALID_FACT_TYPE", "expected an ISO date YYYY-MM-DD");
      if (spec.min !== undefined && v < spec.min) return bad("FACT_OUT_OF_SCOPE", `must be on or after ${spec.min}`);
      if (spec.max !== undefined && v > spec.max) return bad("FACT_OUT_OF_SCOPE", `must be on or before ${spec.max}`);
      if (spec.excludeMonthDays?.includes(monthDay(v))) return bad("FACT_OUT_OF_SCOPE", `dates on ${monthDay(v)} are not supported`);
      return true;
  }
}

/** Apply defaults, check facts against the declared scope, and collect every reason. */
export function normalizeFacts(pack: RulePack, facts: Obj, period: string): { facts: Obj; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const spec = pack.scope.period;
  if (!isIsoDate(period)) {
    reasons.push({ code: "PERIOD_OUT_OF_SCOPE", path: "period", message: "period must be an ISO date YYYY-MM-DD" });
  } else if (spec) {
    if (spec.min !== undefined && period < spec.min) reasons.push({ code: "PERIOD_OUT_OF_SCOPE", path: "period", message: `period is before the supported range start ${spec.min}` });
    if (spec.max !== undefined && period > spec.max) reasons.push({ code: "PERIOD_OUT_OF_SCOPE", path: "period", message: `period is after the supported range end ${spec.max}` });
    if (spec.dayOfMonth !== undefined && Number(period.slice(8)) !== spec.dayOfMonth) {
      reasons.push({ code: "PERIOD_OUT_OF_SCOPE", path: "period", message: `period must fall on day ${spec.dayOfMonth} of a month` });
    }
  }

  const out: Obj = {};
  for (const key of Object.keys(facts)) {
    if (!(key in pack.scope.facts)) reasons.push({ code: "UNKNOWN_FACT", path: key, message: "this fact is not part of the supported scope" });
  }
  for (const [key, fs] of Object.entries(pack.scope.facts)) {
    let v = facts[key];
    if (v === undefined) {
      if ("default" in fs && fs.default !== undefined) v = fs.default;
      else if (fs.required !== false) {
        reasons.push({ code: "MISSING_FACT", path: key, message: "required fact is missing" });
        continue;
      } else continue;
    }
    if (fs.type !== "array") {
      if (checkScalar(fs, v, key, reasons)) out[key] = v;
      continue;
    }
    if (!Array.isArray(v)) {
      reasons.push({ code: "INVALID_FACT_TYPE", path: key, message: "expected a list" });
      continue;
    }
    if (v.length > fs.maxItems) reasons.push({ code: "TOO_MANY_ITEMS", path: key, message: `at most ${fs.maxItems} items are supported` });
    if (fs.minItems !== undefined && v.length < fs.minItems) reasons.push({ code: "TOO_FEW_ITEMS", path: key, message: `at least ${fs.minItems} items are required` });
    const items: Obj[] = [];
    v.forEach((raw, i) => {
      const base = `${key}[${i}]`;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        reasons.push({ code: "INVALID_FACT_TYPE", path: base, message: "expected an object" });
        return;
      }
      const item: Obj = {};
      for (const k of Object.keys(raw)) {
        if (!(k in fs.item)) reasons.push({ code: "UNKNOWN_FACT", path: `${base}.${k}`, message: "this fact is not part of the supported scope" });
      }
      for (const [ik, ispec] of Object.entries(fs.item)) {
        let iv = (raw as Obj)[ik];
        if (iv === undefined) {
          if ("default" in ispec && ispec.default !== undefined) iv = ispec.default;
          else if (ispec.required !== false) {
            reasons.push({ code: "MISSING_FACT", path: `${base}.${ik}`, message: "required fact is missing" });
            continue;
          } else continue;
        }
        if (checkScalar(ispec, iv, `${base}.${ik}`, reasons)) item[ik] = iv;
      }
      items.push(item);
    });
    if (fs.uniqueBy) {
      const seen = new Set<unknown>();
      for (const it of items) {
        const k = it[fs.uniqueBy];
        if (k === undefined) continue;
        if (seen.has(k)) {
          reasons.push({ code: "DUPLICATE_ITEM", path: key, message: `items must have distinct ${fs.uniqueBy}` });
          break;
        }
        seen.add(k);
      }
    }
    out[key] = items;
  }
  return { facts: out, reasons };
}

// ---- evaluation ----------------------------------------------------------------

interface Ctx {
  pack: RulePack;
  facts: Obj;
  period: string;
  knowledgeDate: string;
  memo: Map<string, Scalar>;
  active: Set<string>;
  trace: TraceEntry[];
}
type Env = Record<string, Obj>;

const num = (v: Scalar, where: string): number => {
  if (typeof v !== "number") return stop("RULE_TYPE_ERROR", `expected a number, got ${typeof v}`, where);
  return v;
};
const bool = (v: Scalar, where: string): boolean => {
  if (typeof v !== "boolean") return stop("RULE_TYPE_ERROR", `expected a boolean, got ${typeof v}`, where);
  return v;
};
const str = (v: Scalar, where: string): string => {
  if (typeof v !== "string") return stop("RULE_TYPE_ERROR", `expected a string, got ${typeof v}`, where);
  return v;
};
const safe = (n: number, where: string): number =>
  Number.isSafeInteger(n) ? n : stop("RULE_OVERFLOW", "integer overflow", where);

function readFact(path: string, ctx: Ctx, env: Env): Scalar {
  let cur: unknown;
  if (path.startsWith("$")) {
    const [head, ...rest] = path.slice(1).split(".");
    cur = env[head as string];
    for (const p of rest) cur = (cur as Obj | undefined)?.[p];
  } else {
    cur = path.split(".").reduce<unknown>((o, p) => (o as Obj | undefined)?.[p], ctx.facts);
  }
  if (typeof cur === "number" || typeof cur === "boolean" || typeof cur === "string") return cur;
  return stop("MISSING_FACT", "fact is not available", path);
}

function listFact(name: string, ctx: Ctx): Obj[] {
  const v = ctx.facts[name];
  if (!Array.isArray(v)) return stop("MISSING_FACT", "list fact is not available", name);
  return v as Obj[];
}

function evalRule(ruleId: string, ctx: Ctx): Scalar {
  const memo = ctx.memo.get(ruleId);
  if (memo !== undefined) return memo;
  const versions: RuleVersionT[] = ctx.pack.rules.filter((r) => r.ruleId === ruleId);
  const v = resolveVersion(versions, ctx.period, ctx.knowledgeDate);
  if (!v) return stop("NO_RULE_FOR_PERIOD", `no version of rule ${ruleId} covers ${ctx.period} with knowledge as of ${ctx.knowledgeDate}`, ruleId);
  if (ctx.active.has(ruleId)) return stop("RULE_CYCLE", "rule references form a cycle", ruleId);
  ctx.active.add(ruleId);
  const value = evalExpr(v.expr, ctx, {}, `${ruleId}@${v.versionId}`);
  ctx.active.delete(ruleId);
  ctx.memo.set(ruleId, value);
  ctx.trace.push({ ruleId, versionId: v.versionId, knownFrom: v.knownFrom, knownFromBasis: v.knownFromBasis, citations: v.citations });
  return value;
}

function evalExpr(e: Expr, ctx: Ctx, env: Env, where: string): Scalar {
  const ev = (x: Expr) => evalExpr(x, ctx, env, where);
  switch (e.op) {
    case "lit":
      return e.value;
    case "fact":
      return readFact(e.path, ctx, env);
    case "period":
      return ctx.period;
    case "ref":
      return evalRule(e.rule, ctx);
    case "and": {
      for (const a of e.args) if (!bool(ev(a), where)) return false;
      return true;
    }
    case "or": {
      for (const a of e.args) if (bool(ev(a), where)) return true;
      return false;
    }
    case "not":
      return !bool(ev(e.arg), where);
    case "eq": {
      const l = ev(e.left);
      const r = ev(e.right);
      if (typeof l !== typeof r) return stop("RULE_TYPE_ERROR", "eq compares values of different types", where);
      return l === r;
    }
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const l = ev(e.left);
      const r = ev(e.right);
      if (typeof l !== typeof r || typeof l === "boolean") return stop("RULE_TYPE_ERROR", `${e.op} needs two numbers or two strings`, where);
      const a = l as number | string;
      const b = r as number | string;
      return e.op === "lt" ? a < b : e.op === "lte" ? a <= b : e.op === "gt" ? a > b : a >= b;
    }
    case "inSet":
      return e.set.includes(ev(e.value));
    case "add":
      return safe(e.args.reduce((s, a) => s + num(ev(a), where), 0), where);
    case "mul":
      return safe(e.args.reduce((s, a) => s * num(ev(a), where), 1), where);
    case "min":
      return Math.min(...e.args.map((a) => num(ev(a), where)));
    case "max":
      return Math.max(...e.args.map((a) => num(ev(a), where)));
    case "sub":
      return safe(num(ev(e.left), where) - num(ev(e.right), where), where);
    case "mulBps":
      return divRound(safe(num(ev(e.value), where) * num(ev(e.bps), where), where), 10000, e.round);
    case "if":
      return bool(ev(e.cond), where) ? ev(e.then) : ev(e.else);
    case "lookup": {
      const key = String(ev(e.key));
      const hit = e.table[key];
      return hit === undefined ? stop("LOOKUP_MISS", `no table entry for key ${key}`, where) : hit;
    }
    case "bands": {
      const input = Math.max(0, num(ev(e.input), where));
      let lower = 0;
      let total = 0;
      for (const b of e.bands) {
        const top = b.upTo === null ? input : Math.min(input, b.upTo);
        if (top > lower) total = safe(total + (top - lower) * b.bps, where);
        if (b.upTo === null || input <= b.upTo) break;
        lower = b.upTo;
      }
      return divRound(total, 10000, e.round);
    }
    case "ageOn": {
      const birth = str(ev(e.birth), where);
      const on = str(ev(e.on), where);
      if (!isIsoDate(birth) || !isIsoDate(on)) return stop("RULE_TYPE_ERROR", "ageOn needs ISO dates", where);
      return e.mode === "completedYears" ? completedYears(birth, on) : throughMarch31After(birth, on, e.age);
    }
    case "sumOver": {
      let sum = 0;
      for (const item of listFact(e.list, ctx)) sum = safe(sum + num(evalExpr(e.expr, ctx, { ...env, [e.as]: item }, where), where), where);
      return sum;
    }
    case "countWhere": {
      let n = 0;
      for (const item of listFact(e.list, ctx)) if (bool(evalExpr(e.where, ctx, { ...env, [e.as]: item }, where), where)) n += 1;
      return n;
    }
  }
}

/** Evaluate the requested rules. Returns `unsupported` instead of a guess. */
export function evaluate(pack: RulePack, input: EvalInput): EvalResult {
  const scoped = normalizeFacts(pack, input.facts, input.period);
  if (scoped.reasons.length > 0) return { kind: "unsupported", reasons: scoped.reasons };
  if (!isIsoDate(input.knowledgeDate)) {
    return { kind: "unsupported", reasons: [{ code: "INVALID_KNOWLEDGE_DATE", path: "knowledgeDate", message: "knowledgeDate must be an ISO date YYYY-MM-DD" }] };
  }
  const ctx: Ctx = {
    pack,
    facts: scoped.facts,
    period: input.period,
    knowledgeDate: input.knowledgeDate,
    memo: new Map(),
    active: new Set(),
    trace: [],
  };
  try {
    const values: Record<string, Scalar> = {};
    for (const id of input.outputs) values[id] = evalRule(id, ctx);
    return { kind: "ok", values, trace: ctx.trace };
  } catch (err) {
    if (err instanceof Unsupported) return { kind: "unsupported", reasons: err.reasons };
    throw err;
  }
}
