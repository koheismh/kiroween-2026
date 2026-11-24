// Citation check: verifies that a quote exists in a snapshot and that the cited hash
// matches. It checks quotation integrity only. It does not check legal interpretation.

export interface Citation {
  sourceId: string;
  snapshotSha256: string;
  quote: string;
}

export interface Snapshot {
  id: string;
  sha256: string;
  text: string;
}

export type CitationCheck =
  | { ok: true }
  | { ok: false; code: "SOURCE_MISMATCH" | "HASH_MISMATCH" | "QUOTE_TOO_SHORT" | "QUOTE_NOT_FOUND" };

/** Minimum normalized quote length, so a trivial fragment cannot pass. */
export const MIN_QUOTE_CHARS = 8;

/** Unicode NFKC, then every run of whitespace becomes one space. */
export function normalizeText(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function checkCitation(citation: Citation, snapshot: Snapshot): CitationCheck {
  if (citation.sourceId !== snapshot.id) return { ok: false, code: "SOURCE_MISMATCH" };
  if (citation.snapshotSha256.toLowerCase() !== snapshot.sha256.toLowerCase()) {
    return { ok: false, code: "HASH_MISMATCH" };
  }
  const quote = normalizeText(citation.quote);
  if (quote.length < MIN_QUOTE_CHARS) return { ok: false, code: "QUOTE_TOO_SHORT" };
  return normalizeText(snapshot.text).includes(quote) ? { ok: true } : { ok: false, code: "QUOTE_NOT_FOUND" };
}
