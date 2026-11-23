# Design: Core Model and Feasibility Spikes

## Decisions and trade-offs

| Decision | Choice | Trade-off |
|---|---|---|
| Rule representation | JSON expression tree validated by Zod, about 15 operators | More verifiable and diffable than code. Less expressive. S1 tests the limit. |
| Cross-rule logic | Rules reference other rules by `ref`, forming a DAG | Lets a reform change one rule without touching others. Needs cycle detection. |
| Temporal model | Two dates: `period` and `knowledgeDate`. No transaction-time database. | Covers historical reproduction and revision. Does not model retroactive corrections of past knowledge. |
| Approval state | Not stored in the pack. Valid signature over digests means approved. | No circular self-reference. Needs a separate record file. |
| Signing | Ed25519 via `node:crypto` and WebCrypto. Passphrase-protected key outside the repo. | An agent without the passphrase cannot forge approval. A developer with key and repo control can. Stated in the README. |
| Ground truth protection | Human-run attest command writes a lock digest. Gate compares directory to lock. Hooks ask before agent writes. | Detects modification. Does not prove examples are right. The human checks them against sources. |
| Numbers | Integers only. Rates in basis points. Rounding mode named per operation. | Verbose rules. Avoids floating-point drift. |
| Crew placement | Separate repository (`changeling-crew`, name provisional). It reads proposal and gate-report files and writes a review note. This repo holds only the file format it consumes and produces. | Adds no runtime dependency and duplicates no workflow logic. Needs a second repository and a documented install step. |
| Approval gating | Approve and load both require a gate report bound to the current pack digest with every skeleton-declared gate passed. | Stricter than signing alone. A failing or stale report can never be approved. |

## Data model (sketch)

```ts
type ISODate = string; // YYYY-MM-DD

interface RulePack {
  appId: string;
  schemaVersion: 1;
  scope: ScopeDecl;            // fact paths, types, allowed ranges or enums
  rules: RuleVersion[];
}

interface RuleVersion {
  ruleId: string;              // e.g. "standardDeduction"
  versionId: string;           // e.g. "2025-original"
  appliesFrom: ISODate;
  appliesTo?: ISODate;         // open-ended when absent
  knownFrom: ISODate;          // publication date of the source
  citations: Citation[];       // at least one
  expr: Expr;
}

interface Citation { sourceId: string; snapshotSha256: string; quote: string; }

type EvalResult =
  | { kind: "ok"; values: Record<string, number | boolean>; trace: TraceEntry[] }
  | { kind: "unsupported"; reasons: { code: string; path?: string; message: string }[] };
```

## Initial operator set
- Values: `lit`, `fact`, `ref`
- Logic and comparison: `and`, `or`, `not`, `eq`, `lt`, `lte`, `gt`, `gte`, `inSet`
- Arithmetic: `add`, `sub`, `mul`, `min`, `max`, `mulBps` (value x basis points, with rounding mode), `if`
- Tables: `lookup` (key to value), `bands` (progressive thresholds and basis-point rates)
- Dates: `ageOn` (birth date, date, mode such as "end of fiscal year")
- Lists: `sumOver`, `countWhere` (for per-child sums and child order)

S1 may add at most three operators. Needing more triggers the fallback.

## Temporal example (US)
```
standardDeduction.single:
  2025-original: appliesFrom 2025-01-01, appliesTo 2025-12-31, knownFrom <date of Rev. Proc. 2024-40>, value 1500000 (cents)
  2025-revised:  appliesFrom 2025-01-01, appliesTo 2025-12-31, knownFrom 2025-07-04,               value 1575000
evaluate(period 2025-12-31, knowledgeDate 2025-06-30) -> 1500000
evaluate(period 2025-12-31, knowledgeDate 2025-12-31) -> 1575000
```
The same resolver supports Japan, where `appliesFrom` is the October 2024 effective period and `knownFrom` is the enactment or publication date found in S2. Exact dates and amounts come from sources, not from this document.

## Approval flow
1. `pack.json` -> canonical bytes (sorted keys, integers only) -> SHA-256.
2. Gate report and ground-truth lock are hashed the same way.
3. The human runs `approve`, enters the key passphrase, and the CLI signs `{packDigest, gateReportDigest, groundTruthLockDigest, approverKeyId, approvedAt}`.
4. The loader recomputes all three digests and verifies the signature against the committed public key. It returns `{ ok: false, failed: "pack-digest" | "gate-digest" | "gt-lock" | "signature" }` on any mismatch.

## Ground truth flow
- Human writes or confirms examples from official sources into `ground-truth/`, then runs `attest`, which writes `ground-truth.lock`.
- Agents propose examples into `ground-truth-candidates/` only.
- Hooks (created in task 6) ask for confirmation on agent writes to `ground-truth/**` and `approvals/**`. Hooks are a guard rail. The digest lock is the enforcement.
- Where a second independent oracle exists (for example IRS tax tables), prefer it. S2 records which are available.

## Spike notes
- **S1** builds the real `core/model` and `core/evaluator` first, then encodes four rule sets. The US sets go first because the source is English and the structure is simple. The JP set is the real expressiveness test: age range through the end of the fiscal year, amounts by child order, counting of supported children, income cap removal, and payment schedule.
- **S2** is mostly human-in-the-loop. A script fetches and hashes snapshots. A JP "before" source may need an archive or the pre-reform legal text. The agent reports what exists and does not invent it.
- **S3** is about 100 lines plus tests. Browser verification uses WebCrypto Ed25519 and must be tested in a real browser.
- **S4** follows the Crew app manifest conventions in the official docs. The app contributes one agent and one skill, installed from a local path. It never runs gates itself.
- **S5** uses the US revision. The agent receives the section diff, the current pack, and the schema, and writes a proposal. Gates run unchanged.

## Risks
- The JP source for the pre-reform state may not be available as a clean document. This is the largest schedule risk and is handled in S2.
- Ed25519 in WebCrypto depends on browser support. Fallback is build-time verification.
- The Crew app mechanism is new to this project. S4 is capped at 2 hours.
