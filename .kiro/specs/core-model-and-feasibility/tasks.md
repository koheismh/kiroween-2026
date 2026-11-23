# Tasks: Core Model and Feasibility Spikes

Time boxes are hard limits. At the limit, stop, record the result in `docs/spikes/<id>.md`, and report GO, GO-WITH-FALLBACK, or NO-GO to the developer. Do not extend a box without approval.

- [ ] 1. Scaffold workspace (box: 45 min)
  - [ ] 1.1 Create npm workspace with `packages/core`, TypeScript strict, Vitest, and a root `.gitignore` that does not ignore `.kiro/`
  - [ ] 1.2 Add `docs/decisions.md` with a one-line header
  - _Requirements: tech steering conventions_

- [ ] 2. S1: Expression model and temporal resolution (box: 4 h)
  - [ ] 2.1 Implement Zod schema, validation (cycles, overlaps, integer-only), and the initial operator set in `packages/core`
  - [ ] 2.2 Implement the evaluator with trace, rounding modes, and unsupported results
  - [ ] 2.3 Implement the temporal resolver and unit-test the US dual-date example with placeholder values
  - [ ] 2.4 Encode US 2025 original and revised rules from the IRS sources (standard deduction and brackets, single filer)
  - [ ] 2.5 Encode JP pre- and post-reform rules for the supported scope from the CFA source and the S2 "before" source
  - [ ] 2.6 Write `docs/spikes/s1.md` with operators added, fallbacks used, and the verdict
  - _Requirements: R1, R2, R3, R4, R8_

- [ ] 3. S2: Sources and citation check (box: 3 h)
  - [ ] 3.1 Write a snapshot script that stores bytes, extracted text, URL, timestamp, and SHA-256
  - [ ] 3.2 Snapshot the three verified sources and search for a JP "before" source (archived page or pre-reform legal text). Report what exists.
  - [ ] 3.3 Implement the citation check (NFKC, whitespace collapse) and test it on Japanese and English quotes, including one near-miss quote that must fail
  - [ ] 3.4 Record available second-source oracles (for example IRS tax tables) in `docs/spikes/s2.md`
  - [ ] 3.5 **Human:** confirm the snapshots are the intended documents
  - _Requirements: R7, R8_

- [ ] 4. S3: Approval integrity (box: 2 h)
  - [ ] 4.1 Implement canonical JSON, digests, and Ed25519 sign and verify with `node:crypto`
  - [ ] 4.2 Implement CLI `keygen`, `approve`, and `verify` with a passphrase-protected key outside the repo
  - [ ] 4.3 Test tamper detection for pack, gate report, ground-truth lock, and signature, and the loader's typed errors
  - [ ] 4.4 Test WebCrypto Ed25519 verification in a real browser. If unsupported, choose build-time verification.
  - [ ] 4.5 **Human:** run `keygen` and keep the passphrase private
  - _Requirements: R5, R8_

- [ ] 5. Ground-truth protection (box: 1 h; depends on 4)
  - [ ] 5.1 Implement `attest` and the ground-truth gate against `ground-truth.lock`
  - [ ] 5.2 **Human:** author and attest at least 3 US and 3 JP examples from official sources. An agent may list candidates in `ground-truth-candidates/`.
  - [ ] 5.3 Run the S1 rule sets against attested examples and record mismatches
  - _Requirements: R6_

- [ ] 6. Guard-rail hooks (box: 30 min)
  - [ ] 6.1 Create a PreToolUse hook that asks before agent writes to `**/ground-truth/**` and `**/approvals/**`
  - _Requirements: R6, rule-integrity steering_

- [ ] 7. S4: Minimal Kiro Crew reviewer app (box: 2 h; independent of 2 to 6)
  - [ ] 7.1 Read the Crew App Kit docs and create `crew/` with `app.json`, one reviewer agent, and one skill
  - [ ] 7.2 Install it from a local path and run it on a sample proposal and gate report
  - [ ] 7.3 Define the review note format (markdown with fixed headings) and confirm the app writes only that file
  - [ ] 7.4 Write `docs/spikes/s4.md` with the verdict
  - _Requirements: R8_

- [ ] 8. S5: Agent-drafted proposal from a real diff (box: 2 h; depends on 2, 3, 4, 5)
  - [ ] 8.1 Produce the section diff between the original and revised US snapshots
  - [ ] 8.2 Have a Kiro agent draft a proposal for the revision. Record the prompt and the unedited output.
  - [ ] 8.3 Run schema, citation, and ground-truth gates. Record every failure.
  - [ ] 8.4 If edits are needed, the human makes them and the edits are listed in `docs/spikes/s5.md`
  - _Requirements: R8_

- [ ] 9. Checkpoint (box: 30 min)
  - [ ] 9.1 Summarize all verdicts and fallbacks in `docs/decisions.md`
  - [ ] 9.2 Developer decides: continue as planned, apply fallbacks, or change scope
  - [ ] 9.3 Draft the next spec (apps, workflow, impact report) only after this decision
