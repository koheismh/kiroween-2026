import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkCitation } from "../citations.js";
import { loadPack, verifyCitations } from "./pack-files.js";
import { loadSnapshot } from "./snapshots.js";

const jpDir = fileURLToPath(new URL("../../../../apps/jp-child-allowance/", import.meta.url));
const ID = "jp-cfa-annai-20231204";
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

let tmp: string;
let dir: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "snap-"));
  dir = join(tmp, "sources", ID);
  cpSync(join(jpDir, "sources", ID), dir, { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const meta = () => JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Record<string, unknown>;
const setMeta = (m: Record<string, unknown>) => writeFileSync(join(dir, "meta.json"), JSON.stringify(m, null, 2));

describe("loadSnapshot does not trust stored metadata or text", () => {
  it("loads an untouched snapshot and returns the computed hash and re-derived text", () => {
    const r = loadSnapshot(dir);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.snapshot.id).toBe(ID);
      expect(r.snapshot.sha256).toBe(sha(readFileSync(join(dir, "original.bin"))));
      expect(r.snapshot.text).toBe(readFileSync(join(dir, "extracted.txt"), "utf8"));
    }
  });

  it("detects extracted.txt that was edited", () => {
    const f = join(dir, "extracted.txt");
    writeFileSync(f, readFileSync(f, "utf8").replace("15,000", "16,000"));
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "EXTRACTED_TEXT_MISMATCH" });
  });

  it("detects edited text even when meta.json is edited to look consistent", () => {
    const f = join(dir, "extracted.txt");
    const edited = readFileSync(f, "utf8").replace("15,000", "16,000");
    writeFileSync(f, edited);
    setMeta({ ...meta(), textChars: edited.length });
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "EXTRACTED_TEXT_MISMATCH" });
  });

  it("detects original bytes that no longer match the recorded hash", () => {
    const f = join(dir, "original.bin");
    const bytes = readFileSync(f);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
    writeFileSync(f, bytes);
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "META_HASH_MISMATCH" });
  });

  it("detects a wrong recorded hash and a wrong recorded id", () => {
    setMeta({ ...meta(), sha256: "0".repeat(64) });
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "META_HASH_MISMATCH" });
    setMeta({ ...meta(), id: "something-else" });
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "META_ID_MISMATCH" });
  });

  it("reports a missing file", () => {
    rmSync(join(dir, "extracted.txt"));
    expect(loadSnapshot(dir)).toMatchObject({ ok: false, code: "MISSING_FILE" });
  });

  it("a fully rewritten snapshot loads but no longer matches the hash cited by the pack", () => {
    const fake = Buffer.from("<html><body>FAKE SOURCE TEXT INSERTED BY TAMPERING 12345</body></html>");
    writeFileSync(join(dir, "original.bin"), fake);
    writeFileSync(join(dir, "extracted.txt"), "FAKE SOURCE TEXT INSERTED BY TAMPERING 12345");
    setMeta({ ...meta(), sha256: sha(fake) });
    const loaded = loadSnapshot(dir);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const real = loadSnapshot(join(jpDir, "sources", ID));
    if (!real.ok) throw new Error("fixture broken");
    const cited = { sourceId: ID, snapshotSha256: real.snapshot.sha256, quote: "FAKE SOURCE TEXT INSERTED BY TAMPERING 12345" };
    expect(checkCitation(cited, loaded.snapshot)).toEqual({ ok: false, code: "HASH_MISMATCH" });
  });
});

describe("verifyCitations reports tampered snapshots", () => {
  const fakeQuote = "FAKE SOURCE TEXT INSERTED BY TAMPERING 12345";
  const packWithFakeQuote = () => {
    const pack = structuredClone(loadPack(jpDir));
    const rule = pack.rules.find((r) => r.citations.some((c) => c.sourceId === ID));
    const cited = rule?.citations.find((c) => c.sourceId === ID);
    if (!rule || !cited) throw new Error("fixture missing");
    rule.citations = [{ ...cited, quote: fakeQuote }];
    return pack;
  };

  it("regression: a quote added to extracted.txt no longer passes", () => {
    const f = join(dir, "extracted.txt");
    writeFileSync(f, readFileSync(f, "utf8") + "\n" + fakeQuote);
    const failures = verifyCitations(packWithFakeQuote(), tmp);
    expect(failures.join("\n")).toContain("EXTRACTED_TEXT_MISMATCH");
  });

  it("the same fake quote fails as QUOTE_NOT_FOUND when the snapshot is untouched", () => {
    expect(verifyCitations(packWithFakeQuote(), tmp).join("\n")).toContain("QUOTE_NOT_FOUND");
  });
});