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

