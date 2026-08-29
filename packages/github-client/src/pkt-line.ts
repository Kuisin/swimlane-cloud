/**
 * pkt-line framing — git's wire format (`Documentation/technical/protocol-common.txt`).
 *
 * Each record is a 4-character lowercase hex length prefix that INCLUDES the
 * four prefix bytes, followed by that many minus four bytes of payload. Three
 * lengths are special and carry no payload:
 *
 *   0000  flush-pkt      end of a section / end of the request
 *   0001  delim-pkt      separates a v2 command's arguments from its capabilities
 *   0002  response-end   (v2 stateless-rpc only)
 *
 * Kept dependency-free and `Buffer`-free so the same code runs in a VS Code
 * extension host, a Next server, and a browser.
 */

import { GitHubProtocolError } from "./errors.ts";

export const FLUSH_PKT = "0000";
export const DELIM_PKT = "0001";
export const RESPONSE_END_PKT = "0002";

export type PktRecord =
  | { type: "data"; payload: Uint8Array }
  | { type: "flush" }
  | { type: "delim" }
  | { type: "response-end" };

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

/** Frame one payload string as a pkt-line. Length is byte length, not char count. */
export function encodePktLine(payload: string): Uint8Array {
  const body = encoder.encode(payload);
  const total = body.length + 4;
  if (total > 65520) {
    throw new GitHubProtocolError(`pkt-line payload too large: ${total} bytes (max 65520)`);
  }
  const out = new Uint8Array(total);
  out.set(encoder.encode(total.toString(16).padStart(4, "0")), 0);
  out.set(body, 4);
  return out;
}

/** Concatenate encoded records and raw control pkts into one request body. */
export function concatPkt(parts: Array<Uint8Array | string>): Uint8Array {
  const chunks = parts.map((p) => (typeof p === "string" ? encoder.encode(p) : p));
  const size = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function hexLen(bytes: Uint8Array, at: number): number {
  let n = 0;
  for (let i = at; i < at + 4; i++) {
    const c = bytes[i]!;
    let d: number;
    if (c >= 0x30 && c <= 0x39)
      d = c - 0x30; // 0-9
    else if (c >= 0x61 && c <= 0x66)
      d = c - 0x61 + 10; // a-f
    else if (c >= 0x41 && c <= 0x46)
      d = c - 0x41 + 10; // A-F (tolerated)
    else {
      throw new GitHubProtocolError(
        `invalid pkt-line length prefix at byte ${at}: ${JSON.stringify(decoder.decode(bytes.subarray(at, at + 4)))}`,
      );
    }
    n = n * 16 + d;
  }
  return n;
}

/**
 * Split a whole response body into records.
 *
 * Rejects a truncated stream rather than returning what it managed to read —
 * a half-read ref advertisement silently missing branches is far worse than an
 * error, because the caller would treat it as authoritative.
 */
export function decodePktLines(bytes: Uint8Array): PktRecord[] {
  const out: PktRecord[] = [];
  let at = 0;

  while (at < bytes.length) {
    if (bytes.length - at < 4) {
      throw new GitHubProtocolError(
        `truncated pkt-line stream: ${bytes.length - at} trailing byte(s) at offset ${at}`,
      );
    }
    const len = hexLen(bytes, at);

    if (len === 0) {
      out.push({ type: "flush" });
      at += 4;
      continue;
    }
    if (len === 1) {
      out.push({ type: "delim" });
      at += 4;
      continue;
    }
    if (len === 2) {
      out.push({ type: "response-end" });
      at += 4;
      continue;
    }
    if (len === 3) {
      throw new GitHubProtocolError(`invalid pkt-line length 0003 at offset ${at}`);
    }
    if (at + len > bytes.length) {
      throw new GitHubProtocolError(
        `truncated pkt-line: declared ${len} bytes at offset ${at}, only ${bytes.length - at} available`,
      );
    }
    out.push({ type: "data", payload: bytes.subarray(at + 4, at + len) });
    at += len;
  }

  return out;
}

/** Decode a data record's payload, dropping the single trailing LF git appends. */
export function pktText(rec: PktRecord): string {
  if (rec.type !== "data") return "";
  const s = decoder.decode(rec.payload);
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

/** Convenience: every data record as text, control pkts dropped. */
export function pktTextLines(bytes: Uint8Array): string[] {
  return decodePktLines(bytes)
    .filter((r) => r.type === "data")
    .map(pktText);
}
