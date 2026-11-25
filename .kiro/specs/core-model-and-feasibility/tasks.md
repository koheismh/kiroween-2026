# Tasks: Core Model and Feasibility Spikes

Time boxes are hard limits. At the limit, stop, record the result in `docs/spikes/<id>.md`, and report GO, GO-WITH-FALLBACK, or NO-GO. Do not extend a box without approval. Commit and push after each numbered task (see git-workflow steering).

Order: scaffold, then source availability (S2) and Crew feasibility (S4), then the evaluator (S1). The evaluator is not built until S2 and S4 report and the developer decides at Checkpoint 1.

Status as of 2026-11-24 (JST): tasks 1 to 4 done. Checkpoint 1 closed (continue as planned). Task 5 (S1) is done (GO on expressiveness). Next: tasks 6 and 7.

- [x] 1. Scaffold workspace (box: 45 min)
  - [x] 1.1 npm workspace with `packages/core`, TypeScript strict, Vitest, and a `.gitignore` that keeps `.kiro/` tracked and ignores keys and env files
  - [x] 1.2 `docs/decisions.md` and `docs/spikes/` directory
  - [x] 1.3 Git workflow steering
  - [x] 1.4 Install Node.js LTS (v26.13.1, via winget; it was missing). `npm run typecheck` and `npm test` pass on the placeholder module.
  - _Requirements: tech and git-workflow steering_

- [x] 2. S2: Source availability (box: 90 min) - GO, see `docs/spikes/s2.md`
  - [x] 2.1 Script `scripts/snapshot.mjs` that fetches a URL, stores bytes and extracted text, and records URL, final URL, status, content type, timestamp, and SHA-256
  - [x] 2.2 Snapshot the three given sources plus two Wayback captures (JP "before" 2023-12-04 and JP "after" 2024-07-31). Five snapshots are committed under `apps/*/sources/` (about 1.1 MB). `.gitattributes` keeps their bytes unchanged. All five hashes were re-verified after copying.
  - [x] 2.3 JP "before" source identified (Wayback capture of the CFA "å…ç«¥æ‰‹å½“åˆ¶åº¦ã®ã”æ¡ˆå†…" page). Second-source oracles listed as candidates only: the two CFA PDFs and the IRS Form 1040 instructions. None fetched or attested.
  - [x] 2.4 Write `docs/spikes/s2.md` with the verdict
  - [x] 2.5 Check licensing: CFA content is under Public Data License 1.0 with attribution. IRS licence statement not verified.
  - [x] 2.6 **Human:** confirm the five snapshots are the intended documents (approved 2026-11-24)
  - _Requirements: R7 (availability only), R8_

- [x] 3. S4: Crew feasibility (box: 90 min) - GO, see `docs/spikes/s4.md`
  - [x] 3.1 Read the Crew App Kit docs and the locally installed Crew version
  - [x] 3.2 Create a minimal reviewer app (agent `rule-change-reviewer`, skill `rule-change-review`, sample proposal and gate report) in a separate local repository `changeling-crew`. One local commit (`2e291ec`), no remote.
  - [x] 3.3 Install it from a local path with `kirocrew app install` (succeeded)
  - [x] 3.4 Write `docs/spikes/s4.md` with the verdict and the exact install steps
  - [x] 3.5 **Human:** trust `changeling-crew` in Crew Settings (Security, Third-party apps) and start the gateway. Enable was refused until then.
  - [x] 3.6 Run the reviewer on `examples/sample-proposal/`. Expected: `review.md` with the fixed headings and `DO NOT APPROVE`. Record the outcome in `docs/spikes/s4.md`.
  - [x] 3.7 **Human:** create the GitHub repository for the Crew app (done: `koheismh/changeling-crew`; fixes pushed)
  - _Requirements: R8_

- [x] 4. Checkpoint 1 (box: 15 min) - closed 2026-11-24
  - [x] 4.1 Push all results
  - [x] 4.2 **Human:** review the S2 and S4 verdicts
  - [x] 4.3 Decision: continue as planned, no fallbacks

- [x] 5. S1: Expression model and temporal resolution (box: 4 h) - GO, see `docs/spikes/s1.md`
  - [x] 5.1 Zod schema, validation (cycles, overlaps, integer-only), and the initial operator set in `packages/core`
  - [x] 5.2 Evaluator with trace, rounding modes, and unsupported results
  - [x] 5.3 Temporal resolver, tested with the US dual-date example
  - [x] 5.4 Citation check (NFKC, whitespace collapse), tested on Japanese and English quotes including one near-miss that must fail. Test on IRS table rows, which extract one cell per line.
  - [x] 5.5 Encode US 2025 original and revised rules (standard deduction and brackets, single filer). Money in integer cents. Decide `knownFrom` for the original: IRB issue date 2024-11-04 or the 2024-10-22 date in the text, and record it.
  - [x] 5.6 Encode JP pre- and post-reform rules for the supported scope from the 2023-12-04 and 2024-07-31 snapshots. Record `knownFrom` as a snapshot-date upper bound unless the law text is checked.
  - [x] 5.7 `docs/spikes/s1.md` with operators added, fallbacks used, and the verdict
  - [x] 5.8 S1 hardening from review (2026-11-24)
    - [x] 5.8.1 Loader recomputes SHA-256 from `original.bin` and re-derives the text with a shared extractor; stored metadata and text are only compared. `scripts/snapshot.mjs` uses the same extractor. _Requirements: R7.2, R7.4_
    - [x] 5.8.2 Reject dates after the evaluation period via `notAfterPeriod` (code `DATE_AFTER_PERIOD`). JP birth dates use it. Redundant rule guards removed and the JP pack regenerated. _Requirements: R4.3_
    - [x] 5.8.3 Regression tests: tampered text, tampered bytes, forged metadata, missing file, fully rewritten snapshot, fake quote in `extracted.txt`, and a birth date after the period (unit test plus candidate `jp-u7`). _Requirements: R4.3, R7.2, R7.4_  - _Requirements: R1, R2, R3, R4, R7, R8_

- [x] 6. S3: Approval integrity (box: 2 h) - GO, see `docs/spikes/s3.md`; 6.6 done 2026-11-25 (commit 6dd24bc)
  - [x] 6.1 Canonical JSON, digests, Ed25519 sign and verify with `node:crypto`
  - [x] 6.2 Gate report format and the required-gate list declared by the skeleton
  - [x] 6.3 CLI `keygen`, `approve`, `verify`. `approve` and the loader fail when any required gate failed, is missing, or is bound to a different pack digest.
  - [x] 6.4 Tests: tamper detection for pack, gate report, ground-truth lock, and signature; approval refused on failed, missing, and stale gates
  - [x] 6.5 Test WebCrypto Ed25519 verification in a real browser, or choose build-time verification (GO on Edge and Chrome 158, see `docs/spikes/s3.md`)
  - [x] 6.7 Hardening (2026-11-25): trust anchor (`untrusted-key`, `no-trust-anchor`, fail closed), Windows ACL on the key file, 16-character passphrase minimum, key management decisions. See `docs/decisions.md` and `docs/spikes/s3.md`. _Requirements: R5.4, R5.7_
  - [x] 6.6 **Human:** run `keygen` and keep the passphrase private. Runs after 6.7. `keygen` prints the key id. Pin it in `apps/<app>/trust-anchor.json`, review that file in a commit, and record the id out of band (for example a password manager entry).
  - _Requirements: R5, R8_

- [ ] 7. Ground-truth protection and hooks (box: 1.5 h; depends on 6) - not started
  - [ ] 7.1 `attest` and the ground-truth gate against `ground-truth.lock`
  - [ ] 7.2 PreToolUse hook that asks before agent writes to `**/ground-truth/**` and `**/approvals/**`
  - [ ] 7.3 **Human:** author and attest at least 3 US and 3 JP examples from official sources. An agent may list candidates in `ground-truth-candidates/`.
  - [ ] 7.4 Run the S1 rule sets against attested examples and record mismatches
  - [ ] 7.5 Gate recomputation before approval: `approve` recomputes the schema, citations, and ground-truth gates itself from the pack, source snapshots, and attested ground truth. It must not read or trust a stored `gate-report.json`. The report is an output of that run, bound to the pack digest. `verifyApproval` keeps its stored-report check as tamper evidence only. Add tests where a hand-written passing report over a failing pack is not approvable. _Requirements: R5.5, R5.8, R6_
  - _Requirements: R6_

- [ ] 8. S5: Agent-drafted proposal from a real diff (box: 2 h; depends on 5, 6, 7) - not started
  - [ ] 8.1 Section diff between the original and revised US snapshots
  - [ ] 8.2 A Kiro agent drafts a proposal. Record the prompt and the unedited output.
  - [ ] 8.3 Run all required gates. Record every failure.
  - [ ] 8.4 List any human edits in `docs/spikes/s5.md`
  - _Requirements: R8_

- [ ] 8a. Later, before the Crew reviewer reads real reports: align the Crew sample gate-report with `GateReport` (see the open finding in `docs/decisions.md`, 2026-11-25). Not started.
- [ ] 9. Checkpoint 2 (box: 30 min)
  - [ ] 9.1 Summarize all verdicts and fallbacks in `docs/decisions.md`
  - [ ] 9.2 Developer decides next steps. Draft the next spec (apps, workflow, impact report) only after this decision.
