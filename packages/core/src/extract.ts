// Deterministic text extraction from snapshot bytes. Shared by the snapshot script and the
// loader so the stored text can be re-derived from the original bytes instead of trusted.
// It looks only at the bytes: no content type, no metadata. Uses erasable TypeScript only,
// so Node can run it directly.

function decodeBytes(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const label = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8").trim();
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br|table|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Extracted text, or null when the bytes are not text we can extract (for example a PDF). */
export function extractText(bytes: Uint8Array): string | null {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  if (head.startsWith("%PDF")) return null;
  const decoded = decodeBytes(bytes);
  return /<html|<!doctype html|<body/i.test(decoded.slice(0, 4096)) ? htmlToText(decoded) : decoded;
}