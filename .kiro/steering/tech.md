---
inclusion: always
---

# Technical Conventions

## Stack
- TypeScript (strict, ESM), Node LTS, npm workspaces. No extra package manager.
- Zod for rule-pack schemas. Vitest for tests. Vite + Preact for static web apps.
- Add a dependency only when it saves meaningful work. Prefer `node:crypto` and WebCrypto over crypto libraries.
- No backend. Apps are static and evaluate rules in the browser.

## Layout
```
packages/core/            domain-neutral skeleton (model, evaluator, temporal, sources, gates, cases, approval)
apps/<app>/rules/         rule pack (JSON)
apps/<app>/sources/       original-language source snapshots + metadata
apps/<app>/ground-truth/  human-attested examples (agents must not edit)
apps/<app>/ground-truth-candidates/  agent-suggested examples (no effect until attested)
apps/<app>/proposals/     agent-drafted rule changes and review notes
apps/<app>/approvals/     signed approval records (agents must not edit)
apps/<app>/web/           UI
spikes/                   throwaway time-boxed experiments; results go to docs/spikes/
crew/                     Kiro Crew app (separate from runtime)
docs/                     spike results and decision log only
```
Domain-neutral code belongs in `packages/core`. If app code needs domain-specific rule logic that cannot be expressed in the rule pack, record it in `docs/decisions.md`.

## Conventions
- Money and rates are integers: smallest currency unit, rates in basis points, explicit rounding mode. Floating-point numbers are rejected in rule packs.
- Dates are ISO `YYYY-MM-DD` strings. Evaluation never reads the system clock, network, or randomness.
- Functions in `core` are pure and return typed results. Unsupported input returns a typed `unsupported` result and never throws a number.
- Keep `.kiro/` tracked in git. Never add it to `.gitignore`.
- Keep documentation short. Only `README.md`, `docs/spikes/*`, and `docs/decisions.md` are maintained as prose.
