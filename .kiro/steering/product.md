---
inclusion: always
---

# Product: Changeling Kit (working name)

## Purpose
A lean TypeScript skeleton that keeps rule-based applications accurate when official rules change. Its core is a reviewable change workflow:

source snapshot -> diff -> agent-drafted proposal -> deterministic gates -> human approval -> impact report

## Context
- Kiroween 2026, Skeleton Crew category: a lean template plus two distinct applications built from it. Secondary target: the Best Kiro Crew App bonus prize.
- Submission deadline: Dec 5, 07:00 JST. Internal deadline: Dec 4, evening JST.
- Judges are international. The value must be clear without knowledge of Japanese law.
- The rules page could not be fetched by the agent (HTTP 403). The developer must re-read the official rules before submission, including repository and `.kiro` directory requirements.

## Applications
1. `jp-child-allowance`: Japan's October 2024 child allowance reform. Eligibility, amounts, and payment schedule changed.
2. `us-tax-estimator`: narrowly scoped federal estimator for a single wage earner. Standard deduction and progressive brackets only. Tax year 2025 rules changed after publication (standard deduction for single filers: $15,000 to $15,750).

The apps are distinct (different country, domain, and calculation shape). They are not configuration-only variants. Each owns its facts schema, rule pack, sources, and UI. The skeleton owns everything domain-neutral.

## Honesty rules
- Every replay uses real historical snapshots and is labeled "historical replay". Never present it as live detection.
- Do not claim novelty for rule engines or AI-assisted rule maintenance. OpenFisca and LexImpact exist. The claim is a small reusable change-control skeleton with machine-checked citations, approval enforced at load time, and proof of reuse in two apps.
- Impact numbers come from synthetic cases and are labeled so.
- Disclose how Kiro was actually used, including human edits and failed attempts.
- Outputs are demonstration estimates, not legal or tax advice.

## Out of scope
Live crawling or monitoring, runtime LLM calls, accounts or databases, real user data, a general rule DSL or authoring UI, auto-merge or auto-deploy, translation pipelines, and full coverage of either domain.
