// S1 spike helper (throwaway): generates the two rule packs as JSON.
// The committed pack.json files are the artifacts. This script only avoids hand-writing
// deeply nested expression JSON. Quotes are copied verbatim from the snapshots.
// Usage: node spikes/s1/build-packs.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// ---- expression helpers ---------------------------------------------------------
const lit = (value) => ({ op: "lit", value });
const fact = (path) => ({ op: "fact", path });
const ref = (rule) => ({ op: "ref", rule });
const period = { op: "period" };
const and = (...args) => ({ op: "and", args });
const or = (...args) => ({ op: "or", args });
const add = (...args) => ({ op: "add", args });
const lt = (left, right) => ({ op: "lt", left, right });
const lte = (left, right) => ({ op: "lte", left, right });
const gte = (left, right) => ({ op: "gte", left, right });
const sub = (left, right) => ({ op: "sub", left, right });
const max = (...args) => ({ op: "max", args });
const iff = (cond, then, els) => ({ op: "if", cond, then, else: els });
const through = (birth, age) => ({ op: "ageOn", mode: "throughMarch31After", age, birth, on: period });
const years = (birth) => ({ op: "ageOn", mode: "completedYears", birth, on: period });

// ---- snapshot helpers -------------------------------------------------------------
const snap = (dir, id) => {
  const meta = JSON.parse(readFileSync(`${dir}/${id}/meta.json`, "utf8"));
  const lines = readFileSync(`${dir}/${id}/extracted.txt`, "utf8").split(/\r?\n/).map((l) => l.trim());
  return { id, sha: meta.sha256, lines };
};
const cite = (s, quote) => ({ sourceId: s.id, snapshotSha256: s.sha, quote });
/** Lines from the first match of `from` up to (not including) the first later match of `to`. */
const block = (s, from, to) => {
  const i = s.lines.findIndex((l) => from.test(l));
  if (i < 0) throw new Error(`block start not found: ${from}`);
  let j = i + 1;
  while (j < s.lines.length && !to.test(s.lines[j])) j++;
  return s.lines.slice(i, j).filter(Boolean).join(" ");
};
const line = (s, re) => {
  const l = s.lines.find((x) => re.test(x));
  if (!l) throw new Error(`line not found: ${re}`);
  return l;
};
const write = (path, obj) => {
  mkdirSync(path.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log("wrote", path);
};

// =============================== US ==============================================
{
  const dir = "apps/us-tax-estimator/sources";
  const o = snap(dir, "us-irb-2024-45");
  const r = snap(dir, "us-irb-2025-45");
  const common = { appliesFrom: "2025-01-01", appliesTo: "2025-12-31" };

  const rows = [
    [1192500, 1000],
    [4847500, 1200],
    [10335000, 2200],
    [19730000, 2400],
    [25052500, 3200],
    [62635000, 3500],
  ].map(([upTo, bps]) => ({ upTo, bps }));
  rows.push({ upTo: null, bps: 3700 });

  write("apps/us-tax-estimator/rules/pack.json", {
    appId: "us-tax-estimator",
    schemaVersion: 1,
    scope: {
      period: { min: "2025-01-01", max: "2025-12-31" },
      facts: {
        wagesCents: { type: "integer", min: 0, max: 100000000000 },
        filingStatus: { type: "string", values: ["single"] },
        age65OrOlder: { type: "boolean", values: [false] },
        blind: { type: "boolean", values: [false] },
        claimedAsDependent: { type: "boolean", values: [false] },
      },
      assumptions: [
        "Federal income tax only, tax year 2025.",
        "Single filer who takes the standard deduction.",
        "Wages are the only income. No credits, adjustments, or other taxes.",
        "Estimate for demonstration. Not tax advice.",
      ],
    },
    rules: [
      {
        ruleId: "standardDeductionCents",
        versionId: "2025-original",
        ...common,
        knownFrom: "2024-11-04",
        knownFromBasis: "publication",
        citations: [
          cite(o, line(o, /^\(1\) In general \. For taxable years beginning in 2025, the standard deduction amounts/)),
          cite(o, "Unmarried Individuals (other than Surviving Spouses and Heads of Households) (§ 1(j)(2)(C)) $15,000"),
        ],
        expr: lit(1500000),
      },
      {
        ruleId: "standardDeductionCents",
        versionId: "2025-revised",
        ...common,
        knownFrom: "2025-07-04",
        knownFromBasis: "enactment",
        citations: [
          cite(r, "Section 63(c)(7) as amended by the OBBBA provides the standard deduction amounts under § 63(c)(2) for any taxable year beginning in 2025 as follows:"),
          cite(r, "Unmarried Individuals (other than Surviving Spouses and Heads of Households) (§ 1(j)(2)(C)) $15,750"),
          cite(r, "The OBBBA was signed into law on July 4, 2025."),
        ],
        expr: lit(1575000),
      },
      {
        ruleId: "incomeTaxCents",
        versionId: "2025",
        ...common,
        knownFrom: "2024-11-04",
        knownFromBasis: "publication",
        citations: [
          cite(o, ".01 Tax Rate Tables . For taxable years beginning in 2025, the tax rate tables under § 1 are as follows:"),
          cite(o, block(o, /^TABLE 3 - Section 1\(j\)\(2\)\(C\)/, /^TABLE 4 - /)),
        ],
        expr: {
          op: "bands",
          round: "halfUp",
          input: max(lit(0), sub(fact("wagesCents"), ref("standardDeductionCents"))),
          bands: rows,
        },
      },
    ],
  });
}

// =============================== JP ==============================================
{
  const dir = "apps/jp-child-allowance/sources";
  const pre = snap(dir, "jp-cfa-annai-20231204");
  const post = snap(dir, "jp-cfa-mottoouen-20240731");

  const birth = fact("$child.birthDate");
  const eligiblePre = and(lte(birth, period), through(birth, 15));
  const eligiblePost = and(lte(birth, period), through(birth, 18));

  /** 1 + number of counted children strictly older than $child. */
  const order = (countedOther) => add(lit(1), {
    op: "countWhere",
    list: "children",
    as: "other",
    where: and(lt(fact("$other.birthDate"), birth), countedOther),
  });
  const countedPre = and(lte(fact("$other.birthDate"), period), through(fact("$other.birthDate"), 18));
  const countedPost = and(
    lte(fact("$other.birthDate"), period),
    or(through(fact("$other.birthDate"), 18), and(through(fact("$other.birthDate"), 22), fact("$other.supported"))),
  );

  const income = fact("recipientIncomeYen");
  const amountPre = iff(
    gte(income, ref("incomeCapYen")),
    lit(0),
    iff(
      gte(income, ref("incomeLimitYen")),
      lit(5000),
      iff(
        lt(years(birth), lit(3)),
        lit(15000),
        iff(and(through(birth, 12), gte(order(countedPre), lit(3))), lit(15000), lit(10000)),
      ),
    ),
  );
  const amountPost = iff(
    gte(order(countedPost), lit(3)),
    lit(30000),
    iff(lt(years(birth), lit(3)), lit(15000), lit(10000)),
  );

  const yen = (man) => man * 10000;
  const limit = { 0: yen(622), 1: yen(660), 2: yen(698), 3: yen(736), 4: yen(774), 5: yen(812) };
  const cap = { 0: yen(858), 1: yen(896), 2: yen(934), 3: yen(972), 4: yen(1010), 5: yen(1048) };
  const incomeTable = block(pre, /^扶養親族等の数 ①所得制限限度額/, /^扶養親族等の数に応じて/).replace(/^扶養親族等の数 ①所得制限限度額 ②所得上限限度額 所得制限限度額（万円） 収入額の目安（万円） 所得上限限度額（万円） 収入額の目安（万円） /, "");

  const preBase = { appliesFrom: "2023-12-01", knownFrom: "2023-12-04", knownFromBasis: "snapshot-upper-bound" };
  const postBase = { appliesFrom: "2024-10-01", knownFrom: "2024-07-31", knownFromBasis: "snapshot-upper-bound" };

  write("apps/jp-child-allowance/rules/pack.json", {
    appId: "jp-child-allowance",
    schemaVersion: 1,
    scope: {
      period: { min: "2023-12-01", max: "2026-11-01", dayOfMonth: 1 },
      facts: {
        recipientIncomeYen: { type: "integer", min: 0, max: 100000000 },
        dependents: { type: "integer", min: 0, max: 5 },
        children: {
          type: "array",
          maxItems: 6,
          uniqueBy: "birthDate",
          item: {
            birthDate: { type: "date", min: "1995-01-01", excludeMonthDays: ["04-01"] },
            supported: { type: "boolean", default: false },
          },
        },
      },
      assumptions: [
        "Monthly amount for one recipient household. Period is the first day of the payment month.",
        "Age is measured on the first day of that month. Boundary months for the age-3 step are not verified.",
        "Children born on April 1 are unsupported (the legal day of attaining an age differs by one day).",
        "Children with the same birth date (twins) are unsupported (order is ambiguous).",
        "Income is the recipient's income figure as used in the official limit table, in yen. Dependents 0 to 5 only.",
        "Facility residents, overseas residents, and public servants are out of scope.",
        "Demonstration estimate. Not official advice.",
      ],
    },
    rules: [
      {
        ruleId: "incomeLimitYen",
        versionId: "2023-12",
        ...preBase,
        citations: [cite(pre, incomeTable)],
        expr: { op: "lookup", key: fact("dependents"), table: limit },
      },
      {
        ruleId: "incomeCapYen",
        versionId: "2023-12",
        ...preBase,
        citations: [cite(pre, incomeTable), cite(pre, line(pre, /^なお、令和4年10月支給分から/))],
        expr: { op: "lookup", key: fact("dependents"), table: cap },
      },
      {
        ruleId: "monthlyAllowanceYen",
        versionId: "pre-2024-10",
        ...preBase,
        citations: [
          cite(pre, line(pre, /^中学校卒業まで/)),
          cite(pre, line(pre, /^3歳未満 一律/)),
          cite(pre, line(pre, /^3歳以上 小学校修了前/)),
          cite(pre, line(pre, /^中学生 一律/)),
          cite(pre, line(pre, /^※児童を養育している方の所得が所得制限限度額以上/)),
          cite(pre, line(pre, /^※「第3子以降」/)),
        ],
        expr: { op: "sumOver", list: "children", as: "child", expr: iff(eligiblePre, amountPre, lit(0)) },
      },
      {
        ruleId: "monthlyAllowanceYen",
        versionId: "post-2024-10",
        ...postBase,
        citations: [
          cite(post, line(post, /^令和6年10月から児童手当制度が変わります/)),
          cite(post, line(post, /^児童（0歳から18歳に達する日以後/)),
          cite(post, line(post, /^3歳未満 15,000円/)),
          cite(post, line(post, /^3歳以上高校生年代まで/)),
          cite(post, line(post, /^※「第3子以降」/)),
          cite(post, line(post, /^児童の兄姉等（18歳に達する日以後/)),
          cite(post, line(post, /^中学生以下の児童を養育しているが、所得上限限度額を超過し/)),
        ],
        expr: { op: "sumOver", list: "children", as: "child", expr: iff(eligiblePost, amountPost, lit(0)) },
      },
      {
        ruleId: "paymentsPerYear",
        versionId: "pre-2024-10",
        ...preBase,
        citations: [cite(pre, line(pre, /^原則として、毎年6月、10月、2月/))],
        expr: lit(3),
      },
      {
        ruleId: "paymentsPerYear",
        versionId: "post-2024-10",
        ...postBase,
        citations: [cite(post, line(post, /^児童手当は、毎年2月、4月、6月、8月、10月、12月/))],
        expr: lit(6),
      },
    ],
  });
}
