import { describe, expect, it } from "vitest";
import {
  concatPkt,
  decodePktLines,
  DELIM_PKT,
  encodePktLine,
  FLUSH_PKT,
  pktTextLines,
} from "./pkt-line.ts";
import { GitHubProtocolError } from "./errors.ts";

const dec = new TextDecoder();

describe("encodePktLine", () => {
  it("prefixes the byte length INCLUDING the 4 prefix bytes", () => {
    // "a\n" is 2 bytes -> 2 + 4 = 6 -> "0006"
    expect(dec.decode(encodePktLine("a\n"))).toBe("0006a\n");
  });

  it("counts bytes, not characters", () => {
    // 3 chars, 9 UTF-8 bytes -> 13 -> "000d"
    const out = dec.decode(encodePktLine("日本語"));
    expect(out.slice(0, 4)).toBe("000d");
    expect(new TextEncoder().encode("日本語").length).toBe(9);
  });

  it("matches the framing git documents for a real command", () => {
    expect(dec.decode(encodePktLine("command=ls-refs\n"))).toBe("0014command=ls-refs\n");
    expect(dec.decode(encodePktLine("peel\n"))).toBe("0009peel\n");
    expect(dec.decode(encodePktLine("symrefs\n"))).toBe("000csymrefs\n");
  });

  it("rejects an oversized payload rather than truncating it", () => {
    expect(() => encodePktLine("x".repeat(70000))).toThrow(GitHubProtocolError);
  });
});

describe("decodePktLines", () => {
  it("round-trips data records", () => {
    const bytes = concatPkt([encodePktLine("one\n"), encodePktLine("two\n"), FLUSH_PKT]);
    expect(pktTextLines(bytes)).toEqual(["one", "two"]);
  });

  it("classifies the three control pkts", () => {
    const bytes = concatPkt([FLUSH_PKT, DELIM_PKT, "0002"]);
    expect(decodePktLines(bytes).map((r) => r.type)).toEqual(["flush", "delim", "response-end"]);
  });

  it("strips exactly one trailing LF and no more", () => {
    expect(pktTextLines(concatPkt([encodePktLine("x\n\n")]))).toEqual(["x\n"]);
  });

  it("throws on a truncated stream instead of returning a partial read", () => {
    // A ref advertisement silently missing branches would be treated as
    // authoritative by callers, which is worse than failing.
    const full = concatPkt([encodePktLine("hello\n")]);
    expect(() => decodePktLines(full.subarray(0, full.length - 2))).toThrow(/truncated pkt-line/);
  });

  it("throws on trailing bytes too short to be a length prefix", () => {
    const bytes = concatPkt([encodePktLine("a\n"), "ab"]);
    expect(() => decodePktLines(bytes)).toThrow(/truncated pkt-line stream/);
  });

  it("throws on a non-hex length prefix", () => {
    expect(() => decodePktLines(new TextEncoder().encode("zzzzpayload"))).toThrow(
      /invalid pkt-line length prefix/,
    );
  });

  it("rejects the reserved length 0003", () => {
    expect(() => decodePktLines(new TextEncoder().encode("0003"))).toThrow(/0003/);
  });
});
