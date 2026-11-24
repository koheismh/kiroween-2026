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

