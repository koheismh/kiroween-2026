#!/usr/bin/env node
// Process entry point for the CLI. Holds the only clock read and the terminal prompt.
import { homedir } from "node:os";
import { runCli, type CliIo } from "./cli.js";

function promptSecret(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error(`no terminal for the passphrase prompt; set CHANGELING_PASSPHRASE`));
      return;
    }
    process.stderr.write(label);
    let buf = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(buf);
          return;
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const io: CliIo = {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
  env: process.env,
  home: homedir(),
  today: () => new Date().toISOString().slice(0, 10),
  promptSecret,
};

runCli(process.argv.slice(2), io).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : "unexpected error");
    process.exitCode = 1;
  },
);
