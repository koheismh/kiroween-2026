import { describe, expect, it } from "vitest";
import { checkCitation, normalizeText, type Snapshot } from "./citations.js";

const HASH = "a".repeat(64);
const jp: Snapshot = {
  id: "jp",
  sha256: HASH,
  text: "3歳未満 15,000円（第3子以降は30,000円）\n3歳以上高校生年代まで 10,000円（第3子以降は30,000円）\n0人\u3000（前年末に児童が生まれていない場合　等） 622 833.3",
};
const en: Snapshot = {
  id: "en",
  sha256: HASH,
  text: "Unmarried Individuals (other than Surviving Spouses and Heads of Households) (§ 1(j)(2)(C)) \n$15,000\nMarried Individuals",
};
const cite = (sourceId: string, quote: string, sha = HASH) => ({ sourceId, snapshotSha256: sha, quote });

describe("normalizeText", () => {
  it("applies NFKC and collapses whitespace", () => {
    expect(normalizeText("a\u3000 b\n\nc")).toBe("a b c");
    expect(normalizeText("１２３")).toBe("123");
  });
});

describe("checkCitation", () => {
  it("accepts a Japanese quote", () => {
    expect(checkCitation(cite("jp", "3歳未満 15,000円（第3子以降は30,000円）"), jp)).toEqual({ ok: true });
  });
  it("accepts a quote that spans a line break", () => {
    expect(checkCitation(cite("jp", "30,000円） 3歳以上高校生年代まで 10,000円"), jp)).toEqual({ ok: true });
  });
  it("accepts full-width spaces in the snapshot after NFKC", () => {
    expect(checkCitation(cite("jp", "0人 （前年末に児童が生まれていない場合 等） 622"), jp)).toEqual({ ok: true });
  });
  it("accepts an English table row split over lines", () => {
    expect(checkCitation(cite("en", "(§ 1(j)(2)(C)) $15,000"), en)).toEqual({ ok: true });
  });
  it("rejects a near-miss Japanese quote", () => {
    expect(checkCitation(cite("jp", "3歳未満 16,000円（第3子以降は30,000円）"), jp)).toEqual({ ok: false, code: "QUOTE_NOT_FOUND" });
  });
  it("rejects a near-miss English quote", () => {
    expect(checkCitation(cite("en", "(§ 1(j)(2)(C)) $15,750"), en)).toEqual({ ok: false, code: "QUOTE_NOT_FOUND" });
  });
  it("rejects a hash mismatch, a wrong source, and a trivial quote", () => {
    expect(checkCitation(cite("jp", "3歳未満 15,000円", "b".repeat(64)), jp)).toEqual({ ok: false, code: "HASH_MISMATCH" });
    expect(checkCitation(cite("en", "3歳未満 15,000円"), jp)).toEqual({ ok: false, code: "SOURCE_MISMATCH" });
    expect(checkCitation(cite("jp", "15,000"), jp)).toEqual({ ok: false, code: "QUOTE_TOO_SHORT" });
  });
});
