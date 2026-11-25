# Decision Log

Short entries. Newest last. Format: date, decision, reason, consequence.

## 2026-11-24: Environment
- Node.js LTS (v26.13.1) was not installed. Installed with `winget install OpenJS.NodeJS.LTS`.
- Crew app lives in a separate repository (`changeling-crew`, provisional). This repository defines only the file formats it consumes and produces.

## 2026-11-24: S2 and S4 results
- S2 GO. JP replay pair: Wayback 2023-12-04 (before) and 2024-07-31 (after). US pair: IRB 2024-45 and IRB 2025-45. JP `knownFrom` is bounded by snapshot dates until the law text is checked. See docs/spikes/s2.md.
- S4 partial. App installs from a local path. Enabling needs a human trust grant and the reviewer has not run yet. The reviewer cannot be sandboxed to one file, so integrity relies on gates and signatures, not on the reviewer. See docs/spikes/s4.md.
- Crew app repo is local only (`changeling-crew`). The GitHub CLI is not installed, so the remote must be created by the developer.
- US money is integer cents because IRS tables contain cents.


## 2026-11-24: Reviewer agent configuration (design change)
- Replaced `tools: [@kirocrew-core]` with `fs_read` and `fs_write` restricted to `**/review.md` (auto-approve scope), no shell, web, or MCP. The first config had no file tools. See docs/spikes/s4.md entry 2.
- Proposal format must reference repo-relative snapshot paths so the reviewer can check quotes and dates.
- Crew reinstall revokes the per-app trust grant. Prefer the dashboard update action over uninstall and install.
- Integrity is still carried by gates and signed approval, not by the reviewer.
- Added steering `records.md`: significant failures, findings, design changes, and verification results are recorded concisely and committed at checkpoints.


## 2026-11-24: Checkpoint 1 closed
- Decision: continue as planned. S2 GO (sources approved by the developer). S4 GO (Crew reviewer verified through Crew). No fallbacks applied.
- Design addition (from the Crew review): rule versions carry `knownFromBasis` (`enactment`, `publication`, `snapshot-upper-bound`). Added to the S1 schema.
- Crew remains outside the runtime; its reviews are advice, not gates.


## 2026-11-24: S1 result
- S1 GO on expressiveness. One operator added (`period`). No fallback. Correctness is unchecked until the human attests ground truth (task 7.3). See docs/spikes/s1.md.
- Old rule versions are open-ended. A newer version supersedes them only from its `knownFrom`. This makes replay before a reform was known return the old rules.
- Boundary cases the sources do not settle (April 1 births, twins, age-3 boundary month) are excluded by scope or listed as unverified. They are not guessed.
- Weakness to disclose: nested JSON rules are hard to read in review and needed a generator script.


## 2026-11-24: S1 hardening
- Snapshot loading no longer trusts `meta.json` or `extracted.txt`: hash is recomputed, text is re-derived with a shared extractor. See docs/spikes/s1.md entry 2.
- Inputs that a rule would otherwise ignore silently (birth date after the period) are rejected by scope with `DATE_AFTER_PERIOD`.


## 2026-11-25: Approver trust anchor, key management, key file protection
- Finding: `verifyApproval` trusted `approvals/approver.pub` from the repo, so a self-consistent key swap with a valid re-sign passed. Decision: the key id must equal a trust anchor (`apps/<app>/trust-anchor.json`, outside `approvals/`, and/or an out-of-band id via `--trust-key-id`, `CHANGELING_TRUSTED_KEY_ID`, or a web build constant). Failures: `untrusted-key`, and `no-trust-anchor` when none is configured (fail closed). Threat model: design.md "Trust anchor and threat model" and README.
- Decision: one approver key for both apps, one anchor file per app. Private key outside the repo, backed up offline. Rotation or revocation is a new reviewed anchor commit plus re-running `approve`.
- Finding: Node exports the encrypted key with PBKDF2 at 2048 iterations. Node cannot change it. Mitigation: 16-character passphrase minimum. Open: a scrypt wrapper if stronger protection is wanted. `mode: 0o600` is a no-op on NTFS, so `keygen` applies an `icacls` ACL and refuses if it fails. Measurements: docs/spikes/s3.md.
- Task 7.5 added: `approve` recomputes gates itself and ignores stored reports.

## 2026-11-25: Gate report format vs the Crew sample (open, for integration)
- Status: open, for integration.
- Fact: no Crew gate-report format is specified in this repo's spec, design, steering, or docs. design.md only says Crew "reads proposal and gate-report files". The only evidence is `docs/spikes/s4.md`, which says the Crew sample `gate-report.json` has the required gate `ground-truth` with status `missing`.
- Difference (from that evidence): the implemented `GateReport` (`packages/core/src/gates.ts`, `schemaVersion: 1`, `packDigest`, `gates[{id, status: "pass"|"fail", message?}]`, strict) has no `missing` status. A missing gate is an absent entry, and the strict schema rejects a `missing` status as malformed.
- Not verified: the sample file itself lives in the separate `changeling-crew` repository, outside this workspace, and was not read. Whether it has `schemaVersion` or `packDigest`, and its field names, are unknown. No format is invented here.
- Next: task 8a in tasks.md. When integrating, read the sample, then change one side (preferably the sample, since the skeleton format is enforced by the loader) and record it.
## 2026-11-25: Ground-truth lock and gate (task 7.1)
- Decision: `ground-truth/ground-truth.lock` is `{schemaVersion:1, files:{<name>: sha256 of canonical example JSON}}`. Canonical digests make formatting-only edits (whitespace, key order, line endings) neutral. Every other entry in `ground-truth/` (non-JSON file, subdirectory) is flagged, so nothing can be added unlocked. `attest` refuses invalid examples, duplicate ids, floats, and an empty directory. The gate only reads `ground-truth/`, never `ground-truth-candidates/`.
- Not done here: the gate checks integrity only. Running the rule pack against the examples is task 7.4/7.5.
- Finding (unverified cause): `acl.test.ts` timed out at 5000 ms once in a full `npm test` run (about 73 s, machine under load, `icacls` call) and passed when run alone. Treat as flaky under load. Not changed.

## 2026-11-26: Out-of-band fix attempt failed (before task 7.3)
- Event: a request to fix the ground-truth schema (array/object facts, empty `expected`) and verify the hook live was not a spec task. `spec-task-execution` refused it because it only runs staged tasks. The fallback `kirocrew-worker` timed out after 3600000 ms with no result.
- Verified: afterwards `git status` showed no changes (HEAD `4139ace`, in sync with origin) and no stray test files.
- Decision: track the work as tasks 7.2a (schema fix and regression tests) and 7.2b (live hook verification), run individually before 7.3. Status: open.

## 2026-11-26: Task tools accept numeric-only task IDs

- Finding: `task_get` and `task_update` returned "not found" for IDs with a letter suffix (`7.2a`, `7.2b`, `8a`). Verified: both calls failed on 7.2a. The status `[~]` on 7.2a was left by the failed out-of-band attempt and is reset to `[ ]`.
- Decision: renamed 7.2a to 7.2.1, 7.2b to 7.2.2, and 8a to 8.5 (under task 8). Use numeric-only IDs (`N`, `N.M`, `N.M.K`) from now on.
- Verification: `task_get` finds 7.2.1, 7.2.2, and 8.5, all `not_started`. Not verified: `task_update` on the new IDs (no status change was made, by request). git grep shows the old IDs only in this file's history entries.
