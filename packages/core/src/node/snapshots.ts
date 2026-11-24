// Node-only helper. Not exported from the package index so the core stays browser-safe.
// It does not trust anything stored next to the original bytes: the hash is recomputed and
// the text is re-derived from the bytes. meta.json and extracted.txt are only compared.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Snapshot } from "../citations.js";
import { extractText } from "../extract.js";

export type SnapshotFailureCode =
  | "MISSING_FILE"
  | "META_ID_MISMATCH"
  | "META_HASH_MISMATCH"
  | "NOT_EXTRACTABLE"
  | "EXTRACTED_TEXT_MISMATCH";

export type SnapshotLoad =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; code: SnapshotFailureCode; message: string };

/**
 * Load a snapshot directory written by `scripts/snapshot.mjs`.
 * The returned id is the directory name, the hash is computed from `original.bin`, and the
 * text is extracted from `original.bin`. Stored metadata or text that disagrees is reported.
 */
export function loadSnapshot(dir: string): SnapshotLoad {
  const fail = (code: SnapshotFailureCode, message: string): SnapshotLoad => ({ ok: false, code, message });
  let bytes: Buffer;
  let meta: { id?: unknown; sha256?: unknown };
  let stored: string;
  try {
    bytes = readFileSync(join(dir, "original.bin"));
    meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { id?: unknown; sha256?: unknown };
    stored = readFileSync(join(dir, "extracted.txt"), "utf8");
  } catch (err) {
    return fail("MISSING_FILE", `cannot read snapshot files in ${dir}: ${(err as Error).message}`);
  }
  const id = basename(dir);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (meta.id !== id) return fail("META_ID_MISMATCH", `meta.json id ${String(meta.id)} does not match directory ${id}`);
  if (meta.sha256 !== sha256) return fail("META_HASH_MISMATCH", `meta.json sha256 does not match original.bin (computed ${sha256})`);
  const text = extractText(bytes);
  if (text === null) return fail("NOT_EXTRACTABLE", "original.bin is not text this extractor supports");
  if (text !== stored) return fail("EXTRACTED_TEXT_MISMATCH", "extracted.txt differs from the text re-derived from original.bin");
  return { ok: true, snapshot: { id, sha256, text } };
}