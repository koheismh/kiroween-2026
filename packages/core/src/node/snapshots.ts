// Node-only helper. Not exported from the package index so the core stays browser-safe.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "../citations.js";

/** Load a snapshot directory written by `scripts/snapshot.mjs`. */
export function loadSnapshot(dir: string): Snapshot {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { id: string; sha256: string };
  const text = readFileSync(join(dir, "extracted.txt"), "utf8");
  return { id: meta.id, sha256: meta.sha256, text };
}
