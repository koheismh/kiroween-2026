// Smoke tests for the CLI. Temp directories only; never touches real key or approval paths.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REQUIRED_GATES } from "../gates.js";
import { appPath } from "./approval-files.js";
import { runCli, type CliIo } from "./cli.js";
import { canonicalDigest } from "./signing.js";

let root: string;
let app: string;
let keyPath: string;
let out: string[];
let err: string[];

const PASS = "correct horse battery";
/** Run keygen, then pin the printed key id in trust-anchor.json like the human would. */
async function keygen(): Promise<number> {
  const code = await runCli(["keygen", "--app", app, "--key", keyPath], io());
  const id = /key id: ([0-9a-f]{64})/.exec(out.join("\n"))?.[1];
  if (code === 0 && id) writeJson(appPath(app, "trustAnchor"), { schemaVersion: 1, approverKeyId: id });
  return code;
}
const pack = { schemaVersion: 1, rules: [{ id: "a", n: 1 }] };

function io(env: Record<string, string | undefined> = { CHANGELING_PASSPHRASE: PASS }): CliIo {
  return {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    env,
    home: root,
    today: () => "2025-01-02",
    restrictFile: () => ({ ok: true }),
    promptSecret: () => Promise.reject(new Error("no prompt in tests")),
  };
}

function writeJson(path: string, v: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(v));
}

function setup(gateStatus: "pass" | "fail" = "pass"): void {
  writeJson(appPath(app, "pack"), pack);
  const d = canonicalDigest(pack);
  if (!d.ok) throw new Error("digest");
  writeJson(appPath(app, "gateReport"), {
    schemaVersion: 1,
    packDigest: d.digest,
    gates: REQUIRED_GATES.map((id) => ({ id, status: id === "citations" ? gateStatus : "pass" })),
  });
  writeJson(appPath(app, "lock"), { files: {} });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "changeling-cli-"));
  app = join(root, "app");
  keyPath = join(root, "keys", "approver.key");
  out = [];
  err = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("cli", () => {
  it("keygen, approve, verify round trip", async () => {
    setup();
    expect(await keygen()).toBe(0);
    expect(await runCli(["approve", "--app", app, "--key", keyPath, "--at", "2025-01-03"], io())).toBe(0);
    expect(await runCli(["verify", "--app", app], io())).toBe(0);
    expect(out.join("\n")).not.toContain(PASS);
    expect(err.join("\n")).not.toContain(PASS);
  });

  it("verify names the failing check after the pack is modified", async () => {
    setup();
    await keygen();
    await runCli(["approve", "--app", app, "--key", keyPath], io());
    writeJson(appPath(app, "pack"), { ...pack, extra: 1 });
    expect(await runCli(["verify", "--app", app], io())).toBe(1);
    expect(err.join("\n")).toContain("pack-digest");
  });

  it("approve refuses when a required gate failed", async () => {
    setup("fail");
    await keygen();
    expect(await runCli(["approve", "--app", app, "--key", keyPath], io())).toBe(1);
    expect(err.join("\n")).toContain("gates");
    expect(() => readFileSync(appPath(app, "record"))).toThrow();
  });

  it("approve refuses with a wrong passphrase", async () => {
    setup();
    await keygen();
    expect(await runCli(["approve", "--app", app, "--key", keyPath], io({ CHANGELING_PASSPHRASE: "wrong passphrase" }))).toBe(1);
  });

  it("keygen prints the key id and the anchor instruction", async () => {
    await keygen();
    expect(out.join("\n")).toMatch(/key id: [0-9a-f]{64}/);
    expect(out.join("\n")).toContain("trust-anchor.json");
  });
  it("approve and verify fail closed without a trust anchor", async () => {
    setup();
    await runCli(["keygen", "--app", app, "--key", keyPath], io());
    expect(await runCli(["approve", "--app", app, "--key", keyPath], io())).toBe(1);
    expect(err.join("\n")).toContain("no-trust-anchor");
  });
  it("verify reports untrusted-key when the out-of-band id differs", async () => {
    setup();
    await keygen();
    await runCli(["approve", "--app", app, "--key", keyPath], io());
    expect(await runCli(["verify", "--app", app, "--trust-key-id", "0".repeat(64)], io())).toBe(1);
    expect(err.join("\n")).toContain("untrusted-key");
    expect(await runCli(["verify", "--app", app], io({ CHANGELING_TRUSTED_KEY_ID: "1".repeat(64) }))).toBe(1);
  });
  it("keygen removes the key and refuses when the ACL step fails", async () => {
    const failing: CliIo = { ...io(), restrictFile: () => ({ ok: false, detail: "boom" }) };
    expect(await runCli(["keygen", "--app", app, "--key", keyPath], failing)).toBe(1);
    expect(err.join("\n")).toContain("boom");
    expect(existsSync(keyPath)).toBe(false);
    expect(existsSync(appPath(app, "publicKey"))).toBe(false);
  });
  it("keygen rejects a short passphrase", async () => {
    expect(await runCli(["keygen", "--app", app, "--key", keyPath], io({ CHANGELING_PASSPHRASE: "short pass" }))).toBe(1);
  });
  it("keygen refuses a key path inside a git repository", async () => {
    mkdirSync(join(root, "repo", ".git"), { recursive: true });
    expect(await runCli(["keygen", "--app", app, "--key", join(root, "repo", "k.key")], io())).toBe(1);
    expect(err.join("\n")).toContain("inside a git repository");
  });
});
