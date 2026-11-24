import { describe, expect, it } from "vitest";
import { generateApproverKey, signPayload } from "./signing.js";
import { verifyPayloadWeb } from "../webverify.js";

const payload = { packDigest: "ab", approvedAt: "2026-11-24", n: 3, z: ["é", "日本"] };

describe("verifyPayloadWeb (WebCrypto) accepts node:crypto signatures", () => {
  const k = generateApproverKey("pw");
  const s = signPayload(payload, k.privateKeyPem, "pw");
  if (!s.ok) throw new Error("sign failed");

  it("verifies a valid signature", async () => {
    expect(await verifyPayloadWeb(payload, s.signature, k.publicKeyPem)).toEqual({ ok: true });
  });
  it("rejects a tampered payload", async () => {
    expect(await verifyPayloadWeb({ ...payload, n: 4 }, s.signature, k.publicKeyPem)).toEqual({
      ok: false,
      code: "BAD_SIGNATURE",
    });
  });
  it("rejects a bad key and non-integer payloads without throwing", async () => {
    expect((await verifyPayloadWeb(payload, s.signature, "nope")).ok).toBe(false);
    expect(await verifyPayloadWeb({ x: 1.5 }, s.signature, k.publicKeyPem)).toMatchObject({
      code: "NON_INTEGER_NUMBER",
    });
  });
});
