// Windows only: the private key file ACL is restricted to the current user. Temp dir, dummy content.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { restrictToCurrentUser } from "./acl.js";

describe("restrictToCurrentUser", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "changeling-acl-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reports icacls failure instead of swallowing it", () => {
    const r = restrictToCurrentUser("x", "win32", () => {
      throw new Error("access denied");
    });
    expect(r).toMatchObject({ ok: false });
  });
  it("is a no-op success off win32", () => {
    expect(restrictToCurrentUser("x", "linux", () => { throw new Error("must not run"); })).toEqual({ ok: true });
  });
  it.skipIf(process.platform !== "win32")("leaves exactly one ACE, for the current user, with no inheritance", () => {
    const f = join(dir, "dummy.key");
    writeFileSync(f, "not a real key");
    expect(restrictToCurrentUser(f)).toEqual({ ok: true });
    const sid = /"(S-1-[0-9-]+)"/.exec(execFileSync("whoami", ["/user", "/fo", "csv", "/nh"], { encoding: "utf8" }))?.[1];
    const out = execFileSync("icacls", [f], { encoding: "utf8" });
    const aces = out.split(/\r?\n/).filter((l) => /\((F|M|R|W|RX|I)\)/.test(l) || /:\(/.test(l));
    expect(aces).toHaveLength(1);
    expect(aces[0]).not.toContain("(I)");
    expect(aces[0]).toContain("(F)");
    expect(sid).toBeDefined();
  });
});
