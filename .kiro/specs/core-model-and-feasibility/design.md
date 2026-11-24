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
  knownFrom: ISODate;          // when the rule became knowable
  knownFromBasis: "enactment" | "publication" | "snapshot-upper-bound";
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
- Dates: `ageOn` (modes `completedYears` and `throughMarch31After`), `period` (the evaluation period, added in S1)
- Lists: `sumOver`, `countWhere` (for per-child sums and child order)

S1 added one operator (`period`). Date facts can set `notAfterPeriod` so a birth date after the evaluation period is unsupported instead of silently ignored. Needing more than three triggers the fallback. Scope declarations gained `period` range, fact `default`, `excludeMonthDays`, `uniqueBy`, and `assumptions`.

## Temporal example (US)
```
standardDeduction.single:
  2025-original: appliesFrom 2025-01-01, appliesTo 2025-12-31, knownFrom <date of Rev. Proc. 2024-40>, value 1500000 (cents)
  2025-revised:  appliesFrom 2025-01-01, appliesTo 2025-12-31, knownFrom 2025-07-04,               value 1575000
evaluate(period 2025-12-31, knowledgeDate 2025-06-30) -> 1500000
evaluate(period 2025-12-31, knowledgeDate 2025-12-31) -> 1575000
```
The same resolver supports Japan, where `appliesFrom` is the October 2024 effective period. Exact dates and amounts come from sources, not from this document.

Findings from S2 that refine this:
- US original `knownFrom`: IRB 2024-45 is dated 2024-11-04, but Rev. Proc. 2024-40 states its figures reflect law as of 2024-10-22. Task 5.5 picks one and records it.
- JP `knownFrom`: the 2024-07-31 Wayback capture is only an upper bound. The enactment date is not in the snapshots.
- US money is integer cents (IRS brackets contain cents, for example $1,192.50).
- Table rows extract one cell per line, so citations should quote single rows and rely on whitespace collapsing.

## Approval flow
1. `pack.json` -> canonical bytes (sorted keys, integers only) -> SHA-256.
2. Gate report and ground-truth lock are hashed the same way.
3. The human runs `approve`, enters the key passphrase, and the CLI signs `{packDigest, gateReportDigest, groundTruthLockDigest, approverKeyId, approvedAt}`.
4. The loader recomputes all three digests and verifies the signature against the committed public key, trusted only through the trust anchor (below). It returns `{ ok: false, failed: "pack-digest" | "gate-digest" | "gt-lock" | "signature" }` on any mismatch.

## Trust anchor and threat model (R5.7)
`verifyApproval` does not trust `approvals/approver.pub` by itself. It computes the key id (SHA-256 of the SPKI DER) and requires it to equal a trust anchor:
- **Pinned anchor:** `apps/<app>/trust-anchor.json`, `{"schemaVersion":1,"approverKeyId":"<hex>"}`. It lives outside `approvals/` so that changing it is a visible, reviewable commit.
- **Out-of-band anchor:** `--trust-key-id <hex>` or `CHANGELING_TRUSTED_KEY_ID` for the CLI, or an id embedded at web build time (`checkTrustAnchors` in `packages/core/src/trust.ts` is browser-safe). If both anchors exist, both must match.
- No anchor, or a malformed one: `no-trust-anchor` (fail closed). Key id not equal to the anchor: `untrusted-key`. `approve` applies the same anchor check before signing.

Detects: silent modification of pack, gate report, or lock; agent edits to files without the private key; replacing `approver.pub` and re-signing with another key without also changing the anchor; a mismatch between the repo anchor and an out-of-band id.
Does not detect: a developer who controls both the key and the repository; an attacker who changes `approver.pub`, `trust-anchor.json`, and the record together in one commit that nobody reviews. The out-of-band id narrows that gap only if the verifier obtained it from somewhere the attacker does not control.

## Key management (R5.4, R5.7)
- One approver key for both apps (one human approver). Anchors are per app, so an app can rotate on its own.
- Private key: encrypted PKCS#8 outside the repo (default `~/.changeling/approver.key`). `keygen` refuses a path inside a git repository. Back it up offline (encrypted copy on a separate medium) and keep the passphrase in a password manager, not in the same place.
- Public key: `apps/<app>/approvals/approver.pub`. Anchor: `apps/<app>/trust-anchor.json`. `keygen` prints the key id for the human to pin.
- Rotation or revocation: generate a new key, commit a new anchor (reviewed), and re-run `approve` for each app. Old records fail with `untrusted-key`, which is the intended revocation effect. Past records are not re-validated against the old key.

## Private key protection
Node exports the encrypted key as PBES2 with PBKDF2-HMAC-SHA256 at 2048 iterations and AES-256-CBC (measured, see `docs/spikes/s3.md`). The iteration count is low and Node cannot change it on export, so the passphrase carries the protection: `keygen` requires at least 16 characters. A scrypt-based wrapper is a possible later change. On Windows `mode: 0o600` has no effect, so `keygen` runs `icacls /inheritance:r` and grants only the current user SID, and removes the key file and refuses if that fails.

## Gate recomputation (R5.5, R5.8)
`verifyApproval` checks the stored gate report for digest match and pass status. That is tamper evidence, not proof the gates ran. The recomputation lives in `approve` (task 7.5): it runs the schema, citations, and ground-truth gates itself from the pack, snapshots, and attested ground truth, ignores any stored `gate-report.json`, and writes the report bound to the pack digest as an output.
## Ground truth flow
- Human writes or confirms examples from official sources into `ground-truth/`, then runs `attest`, which writes `ground-truth.lock`.
- Agents propose examples into `ground-truth-candidates/` only.
- Hooks (created in task 7.2) ask for confirmation on agent writes to `ground-truth/**` and `approvals/**`. Hooks are a guard rail. The digest lock is the enforcement.
- Where a second independent oracle exists (for example IRS tax tables), prefer it. S2 records which are available.

## Source trust chain
A citation is checked in this order: the rule pack cites a SHA-256, the loader recomputes the hash of `original.bin`, the text is re-derived from those bytes with the shared extractor (`packages/core/src/extract.ts`, also used by `scripts/snapshot.mjs`), and the quote is searched in that derived text. `meta.json` and `extracted.txt` are only compared against the derived values, never used as input. The pack digest that approval signs (task 6) covers the cited hash, so the chain ends at a signed value.

Limit: this detects edits to stored snapshot files. It does not prove the original bytes match what the publisher served. That needs a second retrieval.

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
