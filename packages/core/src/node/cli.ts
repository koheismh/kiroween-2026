// CLI: keygen, approve, verify (task 6.3). Run by the human, not by agents.
//   changeling keygen  --app <dir> [--key <path>]
//   changeling approve --app <dir> [--key <path>] [--at YYYY-MM-DD]
//   changeling verify  --app <dir>
// Passphrase: env CHANGELING_PASSPHRASE, else a hidden prompt. It is never printed or stored.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { isIsoDate } from "../dates.js";
import { checkTrustAnchors } from "../trust.js";
import { appPath, prepareApp, verifyApp, readPublicKey, readTrustAnchors } from "./approval-files.js";
import { restrictToCurrentUser, type AclResult } from "./acl.js";
import { generateApproverKey, publicKeyId, signPayload, verifyPayload } from "./signing.js";

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  env: Record<string, string | undefined>;
  home: string;
  /** Today's date as YYYY-MM-DD. Only the CLI shell reads the clock; pure functions never do. */
  today(): string;
  /** Restrict a private key file to the current user (ACL on Windows). Defaults to `restrictToCurrentUser`. */
  restrictFile?(path: string): AclResult;
  /** Hidden passphrase prompt. Used only when CHANGELING_PASSPHRASE is unset. */
  promptSecret(label: string): Promise<string>;
}

export const PASSPHRASE_ENV = "CHANGELING_PASSPHRASE";
/** Out-of-band expected approver key id (alternative to --trust-key-id). */
export const TRUSTED_KEY_ID_ENV = "CHANGELING_TRUSTED_KEY_ID";

function parseArgs(args: string[]): { opts: Map<string, string>; bad: string | null } {
  const opts = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k?.startsWith("--") || v === undefined || v.startsWith("--")) return { opts, bad: `bad argument: ${k ?? ""}` };
    opts.set(k.slice(2), v);
  }
  return { opts, bad: null };
}

/** True when `path` sits inside a git working tree (a `.git` entry in any ancestor). */
export function isInsideRepo(path: string): boolean {
  let dir = dirname(resolve(path));
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const up = dirname(dir);
    if (up === dir || dir === parse(dir).root) return false;
    dir = up;
  }
}

async function getPassphrase(io: CliIo, confirm: boolean): Promise<string | null> {
  const fromEnv = io.env[PASSPHRASE_ENV];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  const first = await io.promptSecret("Passphrase: ");
  if (confirm && (await io.promptSecret("Repeat passphrase: ")) !== first) return null;
  return first;
}

const MIN_PASSPHRASE = 16;
const USAGE = "usage: changeling <keygen|approve|verify> --app <dir> [--key <path>] [--at YYYY-MM-DD] [--trust-key-id <hex>]";

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd !== "keygen" && cmd !== "approve" && cmd !== "verify") {
    io.err(USAGE);
    return 2;
  }
  const { opts, bad } = parseArgs(rest);
  const appArg = opts.get("app");
  if (bad || !appArg) {
    io.err(bad ?? "--app is required");
    io.err(USAGE);
    return 2;
  }
  const appDir = resolve(appArg);
  const keyPath = resolve(opts.get("key") ?? join(io.home, ".changeling", "approver.key"));

  const oob = opts.get("trust-key-id") ?? (io.env[TRUSTED_KEY_ID_ENV] || undefined);
  if (cmd === "verify") {
    const res = verifyApp(appDir, oob);
    if (res.ok) {
      io.out(`OK: approved ${res.payload.approvedAt} by key ${res.payload.approverKeyId.slice(0, 16)}`);
      return 0;
    }
    io.err(`FAILED: ${res.failed}: ${res.detail}`);
    return 1;
  }

  if (cmd === "keygen") {
    if (isInsideRepo(keyPath)) {
      io.err("refusing: the private key path is inside a git repository. Choose a path outside the repo.");
      return 1;
    }
    const pubPath = appPath(appDir, "publicKey");
    if (existsSync(keyPath) || existsSync(pubPath)) {
      io.err("refusing to overwrite an existing key file");
      return 1;
    }
    const pass = await getPassphrase(io, true);
    if (pass === null) {
      io.err("passphrases did not match");
      return 1;
    }
    if (pass.length < MIN_PASSPHRASE) {
      io.err(`passphrase must be at least ${MIN_PASSPHRASE} characters (the key file uses PBKDF2 with only 2048 iterations)`);
      return 1;
    }
    const kp = generateApproverKey(pass);
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, kp.privateKeyPem, { flag: "wx", mode: 0o600 });
    const acl = (io.restrictFile ?? restrictToCurrentUser)(keyPath);
    if (!acl.ok) {
      rmSync(keyPath, { force: true });
      io.err(`refusing: could not restrict the private key file permissions (${acl.detail}). The key file was removed.`);
      return 1;
    }
    mkdirSync(dirname(pubPath), { recursive: true });
    writeFileSync(pubPath, kp.publicKeyPem, { flag: "wx" });
    io.out(`private key (keep secret, never commit): ${keyPath}`);
    io.out(`public key: ${pubPath}`);
    io.out(`key id: ${kp.keyId}`);
    io.out(`next: pin this key id in ${appPath(appDir, "trustAnchor")} as {"schemaVersion":1,"approverKeyId":"${kp.keyId}"}, review it in a commit, and record it out of band.`);
    return 0;
  }

  // approve
  const at = opts.get("at") ?? io.today();
  if (!isIsoDate(at)) {
    io.err("--at must be YYYY-MM-DD");
    return 2;
  }
  const pubPem = readPublicKey(appDir);
  const keyId = pubPem === undefined ? null : publicKeyId(pubPem);
  if (pubPem === undefined || keyId === null) {
    io.err("approver public key is missing or invalid; run keygen first");
    return 1;
  }
  const tc = checkTrustAnchors(keyId, readTrustAnchors(appDir, oob));
  if (!tc.ok) {
    io.err(`REFUSED: ${tc.failed}: ${tc.detail}`);
    return 1;
  }
  const prepared = prepareApp(appDir, keyId, at);
  if (!prepared.ok) {
    io.err(`REFUSED: ${prepared.failed}: ${prepared.detail}`);
    return 1;
  }
  if (!existsSync(keyPath)) {
    io.err(`private key not found at ${keyPath}`);
    return 1;
  }
  const pass = await getPassphrase(io, false);
  if (pass === null || pass === "") {
    io.err("passphrase required");
    return 1;
  }
  const signed = signPayload(prepared.payload, readFileSync(keyPath, "utf8"), pass);
  if (!signed.ok) {
    io.err(`signing failed: ${signed.code} (wrong passphrase or key file?)`);
    return 1;
  }
  if (!verifyPayload(prepared.payload, signed.signature, pubPem).ok) {
    io.err("REFUSED: the private key does not match the committed public key");
    return 1;
  }
  const recordPath = appPath(appDir, "record");
  mkdirSync(dirname(recordPath), { recursive: true });
  writeFileSync(
    recordPath,
    JSON.stringify({ schemaVersion: 1, payload: prepared.payload, signature: signed.signature }, null, 2) + "\n",
  );
  io.out(`approved ${at}; record written to ${recordPath}`);
  return 0;
}
