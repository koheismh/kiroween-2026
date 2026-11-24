// Canonical JSON for digests: object keys sorted by UTF-16 code unit, no whitespace,
// integers only (floating-point numbers are rejected, as in rule packs). Pure and
// environment-neutral, so a browser can produce the same bytes.

export type CanonicalResult =
  | { ok: true; json: string }
  | { ok: false; code: "NON_INTEGER_NUMBER" | "UNSUPPORTED_VALUE"; path: string };

class Reject extends Error {
  constructor(
    readonly code: "NON_INTEGER_NUMBER" | "UNSUPPORTED_VALUE",
    readonly path: string,
  ) {
    super(code);
  }
}

function emit(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) throw new Reject("NON_INTEGER_NUMBER", path);
      return Object.is(value, -0) ? "0" : String(value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((v, i) => emit(v, `${path}[${i}]`)).join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new Reject("UNSUPPORTED_VALUE", path);
      const obj = value as Record<string, unknown>;
      const parts = Object.keys(obj)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${emit(obj[k], `${path}.${k}`)}`);
      return `{${parts.join(",")}}`;
    }
    default:
      // undefined, function, symbol, bigint
      throw new Reject("UNSUPPORTED_VALUE", path);
  }
}

export function canonicalize(value: unknown): CanonicalResult {
  try {
    return { ok: true, json: emit(value, "$") };
  } catch (e) {
    if (e instanceof Reject) return { ok: false, code: e.code, path: e.path };
    throw e;
  }
}
