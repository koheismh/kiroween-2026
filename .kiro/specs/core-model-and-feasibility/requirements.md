# Requirements: Core Model and Feasibility Spikes

## Introduction
This spec covers the first two days of work. It defines the minimum core model of the Changeling Kit skeleton and five time-boxed spikes that decide whether the architecture is feasible. No production features (UI, full workflow, impact report) are in scope.

The spikes exist to answer five questions. Each has a go/no-go exit criterion and a pre-agreed fallback, so a failure changes the plan instead of stalling it.

## Requirements

### R1: Rule pack model
**User story:** As a developer, I want a validated, versioned rule pack format so that rule changes are explicit, reviewable data.

1. A rule pack SHALL declare `appId`, `schemaVersion`, a supported-scope declaration, and a list of rule versions.
2. Each rule version SHALL have `ruleId`, `versionId`, `appliesFrom`, optional `appliesTo`, `knownFrom`, `knownFromBasis` (`enactment`, `publication`, or `snapshot-upper-bound`), at least one citation, and an expression.
3. A citation SHALL contain `sourceId`, `snapshotSha256`, and a verbatim `quote`.
4. The schema SHALL reject non-integer numbers, unknown operators, reference cycles between rules, and two versions of one rule with the same `knownFrom` and overlapping periods.

### R2: Deterministic evaluation with trace
**User story:** As a reviewer, I want each result to explain itself so that I can check it against the sources.

1. Evaluation SHALL be a pure function of `(rulePack, facts, period, knowledgeDate)`. It SHALL NOT read the clock, network, or randomness.
2. A successful result SHALL include a trace listing each rule version used (`ruleId@versionId`) and its citations.
3. Money SHALL use integer arithmetic with an explicit rounding mode per operation.

### R3: Temporal resolution
**User story:** As a reviewer, I want to reproduce past estimates and compute revised ones so that a later rule change never makes an earlier correct estimate look like an error.

1. For each rule, the evaluator SHALL select among versions covering `period` with `knownFrom <= knowledgeDate`, taking the latest `knownFrom`.
2. WHEN no version qualifies, the evaluator SHALL return `unsupported` with code `NO_RULE_FOR_PERIOD`.
3. For the US case, evaluating tax year 2025 with a knowledge date before the July 4, 2025 enactment SHALL yield the original standard deduction. With a later knowledge date it SHALL yield the revised one.

### R4: Explicit unsupported results
**User story:** As a user, I want out-of-scope situations to be flagged so that I am never shown a misleading number.

1. WHEN a fact is missing, invalid, or outside the declared supported scope, evaluation SHALL return `{ kind: "unsupported", reasons: [...] }` with a stable reason code and the offending fact path.
2. Evaluation SHALL NOT return a numeric result alongside an unsupported reason.
3. WHEN a date fact declared `notAfterPeriod` is later than the evaluation period (for example a child born after the period), evaluation SHALL return `unsupported` with code `DATE_AFTER_PERIOD` and the fact path. A rule SHALL NOT silently ignore such a fact.

### R5: Approval integrity
**User story:** As a maintainer, I want modified rule packs to lose their approval automatically so that nothing unreviewed reaches users.

1. The system SHALL compute a canonical SHA-256 digest of a rule pack from sorted-key JSON.
2. An approval record SHALL contain the pack digest, gate report digest, ground-truth lock digest, approver key id, and timestamp, signed with Ed25519.
3. The loader SHALL refuse a pack when the digest or signature does not verify, returning a typed error that names the failing check.
4. The approver private key SHALL be passphrase-protected and stored outside the repository.
5. The approve command SHALL refuse to sign unless a gate report exists for the current pack digest and every required gate in it has passed. The loader SHALL apply the same check, so an approval record over a failing or stale gate report is rejected.
6. Required gates SHALL be declared by the skeleton, not by the proposal. A missing gate counts as failed.
7. The loader SHALL trust the approver public key only if its key id (SHA-256 of the SPKI DER) equals a trust anchor: a pinned key id in a trust file outside `approvals/`, an out-of-band key id supplied by the verifier, or both (then both must match). With no anchor configured the loader SHALL fail closed. A key id that does not match SHALL fail with `untrusted-key`.
8. The `approve` command SHALL recompute every required gate itself from the pack, the source snapshots, and the attested ground truth. It SHALL NOT trust a stored gate report. The resulting gate report SHALL be bound to the pack digest.

### R6: Independent ground truth
**User story:** As a maintainer, I want a source of truth that agent-written tests cannot silently alter.

1. Ground-truth examples SHALL record `sourceId`, a locator, input facts, expected output, and the human attester.
2. A ground-truth lock SHALL contain the digest of all examples and SHALL be written only by an attest command run by the human.
3. WHEN the ground-truth directory no longer matches its lock, the ground-truth gate SHALL fail.
4. Agent-suggested examples SHALL live in a separate candidates directory and SHALL NOT be used by any gate.

### R7: Source snapshots and citation checking
**User story:** As a reviewer, I want each cited quote tied to an exact snapshot so that I can verify it.

1. A snapshot SHALL store original bytes, extracted text, retrieval timestamp, URL, and SHA-256.
2. The citation check SHALL pass only when the quote exists in the snapshot's text after Unicode NFKC normalization and whitespace collapsing, and the cited hash equals the SHA-256 recomputed from the original bytes.
3. The check SHALL work for Japanese and English text.
4. The loader SHALL NOT trust stored metadata or stored extracted text. It SHALL recompute the SHA-256 from the original bytes, re-derive the text from them with the shared extractor, and return a typed failure (`MISSING_FILE`, `META_ID_MISMATCH`, `META_HASH_MISMATCH`, `NOT_EXTRACTABLE`, `EXTRACTED_TEXT_MISMATCH`) when stored values disagree.

### R8: Feasibility spikes with go/no-go
**User story:** As the developer, I want each risky assumption tested early so that I can change the plan within two days.

Spikes run in this order: S2 (availability) and S4 (Crew) before S1 (evaluator), so that the evaluator is not built on sources or a Crew path that turn out to be unavailable. Each spike SHALL have a time box, an exit criterion, and a recorded result in `docs/spikes/<id>.md` stating GO, GO-WITH-FALLBACK, or NO-GO and the evidence.

| Spike | Question | Exit criterion (GO) | Fallback |
|---|---|---|---|
| S1 | Can the expression model encode both apps' old and new rules? | US 2025 original and revised, and JP pre- and post-reform rules for the supported scope, evaluate correctly with no app-specific rule code. At most 3 operators added after the initial set. | Declare derived facts (e.g. child order) in app code, record in `docs/decisions.md`, and disclose. |
| S2 (availability only) | Do clean before/after official sources exist and can they be fetched and hashed? | The three given sources are fetched and hashed. A JP "before" source is identified (URL, date, format), or a documented substitute. Text extraction is checked on one Japanese and one English sample. The citation check itself is built later, in S1. | Use the closest archived or legal-text source and label the limitation. |
| S3 | Is the approval mechanism simple and tamper-evident? | Sign, verify, and tamper-detection tests pass in Node. Browser verification works, or build-time verification is chosen. | Build-time verification only. |
| S4 | Can a minimal Kiro Crew app be installed and used as a reviewer? | A skill-only or agent-only app in its own repository is installed from a local path and produces a review note in a fixed format from a sample proposal. The final app lives in a separate repository. | Skip Crew. Use a plain Kiro agent with steering and hooks, and state this honestly. |
| S5 | Can Kiro draft a proposal that passes the gates from a real source diff? | For the US revision, an agent-drafted proposal passes schema, citation, and ground-truth gates, or the failures are recorded. | "Kiro drafts, human edits", disclosed as such. |
