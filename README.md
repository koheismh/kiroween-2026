# kiroween-2026
Kiroween 2026 hackathon project

## Approval trust boundary
An approval is a valid Ed25519 signature over the digests of the rule pack, the gate report, and the ground-truth lock. The loader recomputes the digests, then trusts the approver public key only if its key id (SHA-256 of the SPKI DER) matches a trust anchor: `apps/<app>/trust-anchor.json` (outside `approvals/`), an out-of-band key id given by the verifier (`--trust-key-id`, `CHANGELING_TRUSTED_KEY_ID`, or a web build constant), or both. With no anchor it fails closed.

This detects: silent modification of a pack, gate report, or lock after approval; edits by an agent that lacks the private key; and replacing the public key without also changing the anchor.
This does not defend against: a developer who controls both the key and the repository, or a single unreviewed commit that changes the public key, the anchor, and the approval record together. Review changes to `trust-anchor.json` and compare the key id with one you recorded elsewhere.
Verifying a stored gate report shows it was not altered. It does not show the gates ran. Recomputing gates is the job of `approve` (planned, task 7.5).
Outputs are demonstration estimates, not legal or tax advice.
