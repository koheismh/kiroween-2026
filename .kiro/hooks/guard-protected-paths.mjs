// PreToolUse guard: ask before an agent touches ground-truth/ or approvals/.
// Guard rail only. The digest lock and signature check are the enforcement.
// Reads the hook JSON from stdin; inspects only the tool input (file paths and shell text).
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let payload = {};
try {
  payload = JSON.parse(raw);
} catch {
  // Unparseable input: fall back to scanning the raw text.
  payload = { tool_input: raw };
}

const input = payload.tool_input ?? payload.toolInput ?? payload.input ?? payload;
const text = typeof input === "string" ? input : JSON.stringify(input);

// Matches path segments "ground-truth" or "approvals" (not "ground-truth-candidates").
// JSON.stringify doubles backslashes, so accept one or more of / or \ as separator.
const protectedSegment = /(^|[\\/"'\s])(ground-truth|approvals)(?=[\\/"'\s]|$)/i;

if (protectedSegment.test(text)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: "ask",
        permissionDecisionReason:
          "This touches ground-truth/ or approvals/. Only the human developer may change these (attest/approve). Confirm only if you made this request.",
      },
    }),
  );
}
process.exit(0);
