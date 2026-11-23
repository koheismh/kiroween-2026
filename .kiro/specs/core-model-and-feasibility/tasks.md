# Tasks: Core Model and Feasibility Spikes

Time boxes are hard limits. At the limit, stop, record the result in `docs/spikes/<id>.md`, and report GO, GO-WITH-FALLBACK, or NO-GO. Do not extend a box without approval. Commit and push after each numbered task (see git-workflow steering).

Order: scaffold, then source availability (S2) and Crew feasibility (S4), then the evaluator (S1). The evaluator is not built until S2 and S4 report.

- [x] 1. Scaffold workspace (box: 45 min)
  - [x] 1.1 npm workspace with `packages/core`, TypeScript strict, Vitest, and a `.gitignore` that keeps `.kiro/` tracked and ignores keys and env files
  - [x] 1.2 `docs/decisions.md` and `docs/spikes/` directory
  - [x] 1.3 Git workflow steering
  - _Requirements: tech and git-workflow steering_

- [ ] 2. S2: Source availability (box: 90 min)
  - [ ] 2.1 Script `scripts/snapshot.mjs` that fetches a URL, stores bytes and extracted text, and records URL, timestamp, and SHA-256
  - [ ] 2.2 Snapshot the three given sources. Report size, format, and extraction quality. Do not commit large or unclear-license files.
  - [ ] 2.3 Identify a JP "before" source (archived CFA page, pre-reform legal text) and a second-source oracle for each app. Report what exists. Do not invent any.
  - [ ] 2.4 Write `docs/spikes/s2.md` with the verdict
  - [ ] 2.5 **Human:** confirm the snapshots are the intended documents
  - _Requirements: R7 (availability only), R8_

- [ ] 3. S4: Crew feasibility (box: 90 min)
  - [ ] 3.1 Read the Crew App Kit docs and the locally installed Crew version
  - [ ] 3.2 Create a minimal reviewer app (one agent or skill) in a separate local repository `changeling-crew`
  - [ ] 3.3 Install it from a local path and run it on a sample proposal. Record whether it produces a review note in the fixed format.
  - [ ] 3.4 Write `docs/spikes/s4.md` with the verdict and the exact install steps
  - _Requirements: R8_

- [ ] 4. Checkpoint 1 (box: 15 min)
  - [ ] 4.1 Push all results. Developer reviews S2 and S4 verdicts.
  - [ ] 4.2 Decide: continue, apply fallbacks, or change scope. Update this plan.

- [ ] 5. S1: Expression model and temporal resolution (box: 4 h)
  - [ ] 5.1 Zod schema, validation (cycles, overlaps, integer-only), and the initial operator set in `packages/core`
  - [ ] 5.2 Evaluator with trace, rounding modes, and unsupported results
  - [ ] 5.3 Temporal resolver, tested with the US dual-date example
  - [ ] 5.4 Citation check (NFKC, whitespace collapse), tested on Japanese and English quotes including one near-miss that must fail
  - [ ] 5.5 Encode US 2025 original and revised rules (standard deduction and brackets, single filer)
  - [ ] 5.6 Encode JP pre- and post-reform rules for the supported scope
  - [ ] 5.7 `docs/spikes/s1.md` with operators added, fallbacks used, and the verdict
  - _Requirements: R1, R2, R3, R4, R7, R8_

- [ ] 6. S3: Approval integrity (box: 2 h)
  - [ ] 6.1 Canonical JSON, digests, Ed25519 sign and verify with `node:crypto`
  - [ ] 6.2 Gate report format and the required-gate list declared by the skeleton
  - [ ] 6.3 CLI `keygen`, `approve`, `verify`. `approve` and the loader fail when any required gate failed, is missing, or is bound to a different pack digest.
  - [ ] 6.4 Tests: tamper detection for pack, gate report, ground-truth lock, and signature; approval refused on failed, missing, and stale gates
  - [ ] 6.5 Test WebCrypto Ed25519 verification in a real browser, or choose build-time verification
  - [ ] 6.6 **Human:** run `keygen` and keep the passphrase private
  - _Requirements: R5, R8_

- [ ] 7. Ground-truth protection and hooks (box: 1.5 h; depends on 6)
  - [ ] 7.1 `attest` and the ground-truth gate against `ground-truth.lock`
  - [ ] 7.2 PreToolUse hook that asks before agent writes to `**/ground-truth/**` and `**/approvals/**`
  - [ ] 7.3 **Human:** author and attest at least 3 US and 3 JP examples from official sources. An agent may list candidates in `ground-truth-candidates/`.
  - [ ] 7.4 Run the S1 rule sets against attested examples and record mismatches
  - _Requirements: R6_

- [ ] 8. S5: Agent-drafted proposal from a real diff (box: 2 h; depends on 5, 6, 7)
  - [ ] 8.1 Section diff between the original and revised US snapshots
  - [ ] 8.2 A Kiro agent drafts a proposal. Record the prompt and the unedited output.
  - [ ] 8.3 Run all required gates. Record every failure.
  - [ ] 8.4 List any human edits in `docs/spikes/s5.md`
  - _Requirements: R8_

- [ ] 9. Checkpoint 2 (box: 30 min)
  - [ ] 9.1 Summarize all verdicts and fallbacks in `docs/decisions.md`
  - [ ] 9.2 Developer decides next steps. Draft the next spec (apps, workflow, impact report) only after this decision.
