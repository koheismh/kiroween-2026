---
inclusion: always
---

# Rule Change Integrity

These invariants protect the correctness claims of the project. Do not weaken them to make a task easier.

## Agent permissions
- Agents may write: `proposals/**`, `ground-truth-candidates/**`, `spikes/**`, source code, tests.
- Agents must not create or edit: `approvals/**`, `ground-truth/**`, approver keys, or approval digests. Agents must not run the approve or attest commands. Only the human developer does.
- A proposal must not add or change its own ground truth.

## Temporal model
- Every rule version has `appliesFrom`/`appliesTo` (the period it governs) and `knownFrom` (when the source made it knowable).
- Evaluation takes `(facts, period, knowledgeDate)`. For a rule, choose among versions that cover `period` and have `knownFrom <= knowledgeDate`, taking the latest `knownFrom`.
- A decision that was correct under the knowledge at the time is never labeled an error. Re-evaluation reports it as "correct at the time, superseded".

## Approval
- "Approved" is not a field in the rule pack. It means a valid signature exists over the canonical digest of the pack, the gate report, and the ground-truth lock.
- The loader recomputes digests and refuses any pack that has been modified since approval.
- The trust boundary is stated in the README: this detects silent modification and agent edits. It does not defend against a developer who controls both the key and the repository.

## Ground truth
- Ground-truth examples come from official sources and are attested by the human developer. Agent-generated tests are not ground truth.
- A verbatim citation check verifies that a quote exists in a snapshot. It does not verify legal interpretation. Do not describe it as more.

## Unsupported cases
- Every rule pack declares its supported scope. Out-of-scope or missing facts return `unsupported` with a reason code. Never return a best-guess number.

## Source documents
- Keep official sources in their original language. Add English explanations separately and label them as non-official.
