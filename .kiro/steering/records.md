---
inclusion: always
---

# Records of Failures, Findings, and Verification

Keep a short, factual record of anything a later reader (or a judge) would need to understand how the project really went.

## What to record
- Significant failures: something that did not work, was blocked, or was wrong, including failed Kiro or Crew attempts.
- Findings: facts that changed the plan, such as a source that is missing or a tool limit.
- Design changes: a decision that replaces an earlier one, and why.
- Verification results: what was checked, how, and the outcome. Say what was not verified.

Do not record routine progress or small fixes.

## Where
- Spike results, failures, and verification: `docs/spikes/<id>.md`.
- Design and scope decisions: `docs/decisions.md`. If a decision changes the spec, update `design.md` or `tasks.md` in the same commit.
- Human-process notes (what the agent drafted and what the human edited): the relevant spike file.

## How
- One entry per event: date, what happened, cause, fix or decision, verification, status.
- Use exact commands, file names, versions, and error text where short. Do not paste long logs.
- Mark each claim as verified (with the check) or unverified.
- Keep failed attempts in the record. Do not rewrite history to look cleaner. Add a new entry when status changes.
- Record the date in the file name or entry heading in `YYYY-MM-DD` form.

## When
- Write the record in the same working session as the event.
- Commit records at checkpoints together with the related change, and push before the developer's review (see git-workflow steering).
