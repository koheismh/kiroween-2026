// Windows file ACL tightening for the private key file. `mode: 0o600` does nothing on NTFS.
// Removes inherited ACEs and grants Full control only to the current user's SID.
// Failures are returned, never swallowed. Runner is injectable for tests.
import { execFileSync } from "node:child_process";

export type AclResult = { ok: true } | { ok: false; detail: string };
export type Run = (file: string, args: string[]) => string;

const defaultRun: Run = (file, args) => execFileSync(file, args, { encoding: "utf8", windowsHide: true });

/** Current user's SID from `whoami /user`, or null. */
function currentSid(run: Run): string | null {
  const out = run("whoami", ["/user", "/fo", "csv", "/nh"]);
  const m = /"(S-1-[0-9-]+)"\s*$/m.exec(out);
  return m?.[1] ?? null;
}

/**
 * Restrict `path` to the current user on win32. On other platforms this is a no-op success
 * (the caller already created the file with mode 0600).
 */
export function restrictToCurrentUser(path: string, platform: string = process.platform, run: Run = defaultRun): AclResult {
  if (platform !== "win32") return { ok: true };
  try {
    const sid = currentSid(run);
    if (sid === null) return { ok: false, detail: "could not determine the current user SID" };
    run("icacls", [path, "/inheritance:r"]);
    run("icacls", [path, "/grant:r", `*${sid}:F`]);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: `icacls failed: ${e instanceof Error ? e.message.split("\n")[0] : "unknown error"}` };
  }
}
