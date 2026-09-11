/**
 * Three-way merge of two edits to one kai-swimlane document.
 *
 * Git merges *lines*. This merges the document, which matters because the
 * conflicts this app actually produces are rarely disagreements about content:
 *
 * - A grammar migration lands on the integration branch while a long-lived
 *   edit branch is still on the old spelling. Both sides rewrote every step
 *   that carries an id, so git conflicts on all of them, even though one side
 *   changed only *how* the document is written. `migrateLegacyDsl` is run over
 *   all three inputs first, so a migration-only edit becomes equal to the base
 *   and drops out of the merge entirely.
 * - Two people touched the same `/role/` block, or the same `/option/` key, in
 *   different places. Those sections are unordered sets of keyed definitions
 *   (dsl-rule.md §grammar: `section := "/role/" def*`, `def := "<" id ">"
 *   property*`), so a per-key three-way is both safe and far more precise than
 *   a line diff that happens to see adjacent text.
 *
 * `/title/` and `/line/` *are* ordered — a row's position is its meaning — so
 * those get a real diff3 over lines rather than a keyed merge that could
 * reorder a nested block away from its closer.
 *
 * Nothing is re-serialized: unchanged regions come through byte for byte, so a
 * merge never reformats a file or drops a construct the reader keeps but the
 * writer would not reproduce (unknown `/role/` keys, trailing comments).
 *
 * The result reports conflicts rather than guessing. A caller that wants git's
 * behaviour of writing markers into the file can render them from `conflicts`;
 * `mergeDsl` itself leaves the base text in place for a conflicted unit.
 */
import { migrateLegacyDsl } from "./legacy-migrate.js";

/**
 * Section markers, in document order. `/i18n/` is keyed like the definition
 * sections; `/title/` and `/line/` are positional.
 */
const SECTION_MARKERS = [
  "/meta/",
  "/title/",
  "/page/",
  "/option/",
  "/role/",
  "/block/",
  "/prop/",
  "/i18n/",
  "/line/",
];

/** Sections whose body is an unordered set of keyed units. */
const KEYED_SECTIONS = new Set(["/meta/", "/page/", "/option/", "/i18n/"]);

/** Sections whose body is a set of `<id>`-headed definitions. */
const DEF_SECTIONS = new Set(["/role/", "/block/", "/prop/"]);

const isSectionMarker = (line) => SECTION_MARKERS.includes(line.trim());

/**
 * Split a document into the preamble (header and `@lang` / `@use` directives),
 * its sections in the order they appear, and the trailer (`@end` and anything
 * after it). Unknown lines before the first marker stay in the preamble so
 * they survive the merge untouched.
 */
export function splitDocument(text) {
  const lines = String(text ?? "").split("\n");
  const head = [];
  const sections = [];
  const tail = [];
  let current = null;
  let done = false;

  for (const line of lines) {
    if (done) {
      tail.push(line);
      continue;
    }
    if (line.trim() === "@end") {
      done = true;
      tail.push(line);
      continue;
    }
    if (isSectionMarker(line)) {
      current = { marker: line.trim(), raw: line, body: [] };
      sections.push(current);
      continue;
    }
    if (current) current.body.push(line);
    else head.push(line);
  }
  return { head, sections, tail };
}

/** Re-join what `splitDocument` produced, preserving each marker line as written. */
export function joinDocument({ head, sections, tail }) {
  const out = [...head];
  for (const s of sections) {
    out.push(s.raw);
    out.push(...s.body);
  }
  out.push(...tail);
  return out.join("\n");
}

/**
 * Cut a section body into keyed units.
 *
 * A unit owns the comment and blank lines that precede it, so moving or
 * dropping a definition takes its comment with it rather than orphaning it on
 * a neighbour. `order` is the position in the side that defined it, used to
 * place units added by both sides deterministically.
 */
function unitsOf(marker, body) {
  const units = [];
  let pending = [];
  let current = null;

  const flush = () => {
    if (current) units.push(current);
    current = null;
  };
  const open = (key, line) => {
    flush();
    current = { key, lines: [...pending, line], order: units.length };
    pending = [];
  };

  for (const line of body) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      // Attach to whatever comes next, unless a unit is already open and this
      // is an interior blank — then it belongs to the open unit.
      if (current && trimmed !== "") current.lines.push(line);
      else pending.push(line);
      continue;
    }

    if (DEF_SECTIONS.has(marker)) {
      const m = trimmed.match(/^<\s*([^>:\s]+)/);
      if (m) {
        open(`${marker}${m[1]}`, line);
        continue;
      }
      if (current) current.lines.push(line);
      else pending.push(line);
      continue;
    }

    // Keyed property sections: `key: value;`, `key;` (a flag) or `unset: …;`.
    // A value may run over several lines until its `;`, so a line that does
    // not start a new key continues the open one.
    const m =
      trimmed.match(/^([A-Za-z_][\w.-]*)\s*[::]/) || trimmed.match(/^([A-Za-z_][\w.-]*)\s*;/);
    if (m && (!current || current.closed)) {
      open(`${marker}${m[1]}`, line);
      current.closed = /;\s*$/.test(trimmed);
      continue;
    }
    if (current) {
      current.lines.push(line);
      current.closed = /;\s*$/.test(trimmed);
      continue;
    }
    open(`${marker}!${units.length}`, line);
    current.closed = /;\s*$/.test(trimmed);
  }

  flush();
  if (pending.length)
    units.push({ key: null, lines: pending, order: units.length, trailing: true });
  return units;
}

const textOf = (unit) => unit.lines.join("\n");

/**
 * Per-key three-way merge of one unordered section.
 *
 * The rules are the ordinary ones — a side that did not change a key defers to
 * the side that did, both sides making the same change is not a conflict, and
 * a key deleted on one side and edited on the other is — applied to whole
 * definitions instead of lines.
 */
function mergeKeyedSection(marker, base, ours, theirs, conflicts) {
  const index = (units) => {
    const map = new Map();
    for (const u of units) if (u.key) map.set(u.key, u);
    return map;
  };
  const bU = unitsOf(marker, base);
  const oU = unitsOf(marker, ours);
  const tU = unitsOf(marker, theirs);
  const b = index(bU);
  const o = index(oU);
  const t = index(tU);

  // Ours first, then keys only theirs added, each in its own side's order.
  const keys = [];
  const seen = new Set();
  for (const u of [...oU, ...tU]) {
    if (u.key && !seen.has(u.key)) {
      seen.add(u.key);
      keys.push(u.key);
    }
  }
  for (const u of bU) {
    if (u.key && !seen.has(u.key)) {
      seen.add(u.key);
      keys.push(u.key);
    }
  }

  const out = [];
  for (const key of keys) {
    const bt = b.has(key) ? textOf(b.get(key)) : null;
    const ot = o.has(key) ? textOf(o.get(key)) : null;
    const tt = t.has(key) ? textOf(t.get(key)) : null;

    if (ot === tt) {
      if (ot !== null) out.push(ot);
      continue;
    }
    if (ot === bt) {
      if (tt !== null) out.push(tt);
      continue;
    }
    if (tt === bt) {
      if (ot !== null) out.push(ot);
      continue;
    }
    conflicts.push({
      section: marker,
      key: key.slice(marker.length),
      base: bt,
      ours: ot,
      theirs: tt,
    });
    if (ot !== null) out.push(ot);
  }

  const trailing = oU.find((u) => u.trailing) || tU.find((u) => u.trailing);
  if (trailing) out.push(textOf(trailing));
  return out.join("\n").split("\n");
}

/** Longest common subsequence of two line arrays, as pairs of indices. */
function lcs(a, b) {
  const n = a.length;
  const m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * diff3 over lines, for the sections where position carries meaning.
 *
 * Anchors are the lines common to all three sides; between two anchors each
 * side has a run, and the ordinary three-way rules decide it. Keeping whole
 * runs rather than merging line by line is what stops a nested block from
 * being separated from its `end-if`.
 */
function mergeLines(marker, base, ours, theirs, conflicts) {
  const ob = lcs(base, ours);
  const tb = lcs(base, theirs);
  const inOurs = new Map(ob.map(([bi, oi]) => [bi, oi]));
  const inTheirs = new Map(tb.map(([bi, ti]) => [bi, ti]));

  const anchors = [];
  for (const [bi, oi] of ob) if (inTheirs.has(bi)) anchors.push([bi, oi, inTheirs.get(bi)]);

  const out = [];
  let bPrev = 0;
  let oPrev = 0;
  let tPrev = 0;

  const region = (bEnd, oEnd, tEnd) => {
    const bRun = base.slice(bPrev, bEnd);
    const oRun = ours.slice(oPrev, oEnd);
    const tRun = theirs.slice(tPrev, tEnd);
    const bs = bRun.join("\n");
    const os = oRun.join("\n");
    const ts = tRun.join("\n");
    if (os === ts) return out.push(...oRun);
    if (os === bs) return out.push(...tRun);
    if (ts === bs) return out.push(...oRun);
    conflicts.push({ section: marker, key: null, base: bs, ours: os, theirs: ts });
    out.push(...oRun);
  };

  for (const [bi, oi, ti] of anchors) {
    region(bi, oi, ti);
    out.push(base[bi]);
    bPrev = bi + 1;
    oPrev = oi + 1;
    tPrev = ti + 1;
  }
  region(base.length, ours.length, theirs.length);
  return out;
}

/** The preamble is a small set of directives; merge it by directive name. */
function mergeHead(base, ours, theirs, conflicts) {
  const key = (line) => {
    const t = line.trim();
    if (t.startsWith("@kai-swimlane")) return "@kai-swimlane";
    const m = t.match(/^(@[\w-]+)/);
    return m ? `${m[1]}:${t}` : null;
  };
  const pick = (lines) => {
    const map = new Map();
    for (const line of lines) {
      const k = key(line);
      if (k) map.set(k, line);
    }
    return map;
  };
  const b = pick(base);
  const o = pick(ours);
  const t = pick(theirs);
  const keys = [...new Set([...o.keys(), ...t.keys(), ...b.keys()])];
  const out = [];
  for (const k of keys) {
    const bl = b.get(k) ?? null;
    const ol = o.get(k) ?? null;
    const tl = t.get(k) ?? null;
    if (ol === tl) {
      if (ol !== null) out.push(ol);
    } else if (ol === bl) {
      if (tl !== null) out.push(tl);
    } else if (tl === bl) {
      if (ol !== null) out.push(ol);
    } else {
      conflicts.push({ section: "@", key: k, base: bl, ours: ol, theirs: tl });
      if (ol !== null) out.push(ol);
    }
  }
  // Blank lines and anything unrecognised follow the directives, taken from
  // ours so a hand-written note is not lost.
  for (const line of ours) if (!key(line)) out.push(line);
  return out;
}

/**
 * Merge `ours` and `theirs`, both descended from `base`.
 *
 * Returns the merged text, whether it is clean, and one entry per conflicted
 * unit. `migrated` says which sides were only brought across a grammar change
 * — useful for telling a user "your draft was on the old spelling, and that is
 * all that differed" rather than showing them a diff of every step.
 */
export function mergeDsl(base, ours, theirs) {
  const norm = (text) => migrateLegacyDsl(String(text ?? "")).text;
  const nb = norm(base);
  const no = norm(ours);
  const nt = norm(theirs);

  const migrated = {
    base: nb !== String(base ?? ""),
    ours: no !== String(ours ?? ""),
    theirs: nt !== String(theirs ?? ""),
  };

  if (no === nt) return { text: no, clean: true, conflicts: [], migrated };
  if (no === nb) return { text: nt, clean: true, conflicts: [], migrated };
  if (nt === nb) return { text: no, clean: true, conflicts: [], migrated };

  const B = splitDocument(nb);
  const O = splitDocument(no);
  const T = splitDocument(nt);
  const conflicts = [];

  const bodyOf = (doc, marker) => doc.sections.find((s) => s.marker === marker)?.body ?? null;
  const rawOf = (doc, marker) => doc.sections.find((s) => s.marker === marker)?.raw ?? marker;

  // Ours sets the section order; a section only theirs introduced is appended
  // in the canonical order rather than wherever the diff happened to land it.
  const markers = [];
  for (const s of [...O.sections, ...T.sections, ...B.sections]) {
    if (!markers.includes(s.marker)) markers.push(s.marker);
  }
  markers.sort((a, b) => SECTION_MARKERS.indexOf(a) - SECTION_MARKERS.indexOf(b));

  const sections = [];
  for (const marker of markers) {
    const b = bodyOf(B, marker);
    const o = bodyOf(O, marker);
    const t = bodyOf(T, marker);
    if (o === null && t === null) continue;
    if (o === null && b !== null) continue; // deleted by us, untouched by them
    if (t === null && b !== null) continue; // deleted by them, untouched by us

    const body =
      KEYED_SECTIONS.has(marker) || DEF_SECTIONS.has(marker)
        ? mergeKeyedSection(marker, b ?? [], o ?? [], t ?? [], conflicts)
        : mergeLines(marker, b ?? [], o ?? [], t ?? [], conflicts);
    sections.push({ marker, raw: o !== null ? rawOf(O, marker) : rawOf(T, marker), body });
  }

  const text = joinDocument({
    head: mergeHead(B.head, O.head, T.head, conflicts),
    sections,
    tail: T.tail.length && !O.tail.length ? T.tail : O.tail,
  });
  return { text, clean: conflicts.length === 0, conflicts, migrated };
}

/**
 * Render conflicts the way git would, for a caller that wants to hand the
 * user a text editor rather than a per-unit choice. Kept separate because the
 * app's own UI should prefer `conflicts`.
 */
export function conflictMarkers(conflicts, oursLabel = "your draft", theirsLabel = "preview") {
  return conflicts
    .map(
      (c) =>
        `<<<<<<< ${oursLabel}${c.key ? ` (${c.section}${c.key})` : ` (${c.section})`}\n` +
        `${c.ours ?? ""}\n=======\n${c.theirs ?? ""}\n>>>>>>> ${theirsLabel}`,
    )
    .join("\n");
}
