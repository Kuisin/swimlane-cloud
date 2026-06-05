/**
 * Pull `/block/` and `/prop/` definitions out of a full DSL document so the
 * engine's `renderPartsPreviewHtml` (which expects a parts fragment) can render
 * a design preview. Works on raw text — no dependency on the parsed model.
 */

const SECTION_MARKERS = new Set([
  "/title/",
  "/page/",
  "/option/",
  "/role/",
  "/block/",
  "/prop/",
  "/line/",
]);

/** Raw body lines of one section (e.g. "/block/") from a document. */
function sliceSection(src, marker) {
  const out = [];
  let inSection = false;
  for (const line of String(src || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (SECTION_MARKERS.has(trimmed)) {
      inSection = trimmed === marker;
      continue;
    }
    if (trimmed === "@end" || trimmed.startsWith("@kai-swimlane")) {
      inSection = false;
      continue;
    }
    if (inSection) out.push(line);
  }
  return out.join("\n").trim();
}

/** A single `<id>` definition out of a section body. */
function sliceDef(sectionBody, id) {
  const out = [];
  let capturing = false;
  for (const line of sectionBody.split(/\r?\n/)) {
    const m = line.trim().match(/^<([^>]+)>$/);
    if (m) {
      capturing = m[1].trim() === id;
      if (capturing) out.push(line);
      continue;
    }
    if (capturing) out.push(line);
  }
  return out.join("\n").trim();
}

/**
 * All definition ids in a section (block or prop).
 * @param {string} src full DSL document
 * @param {"block"|"prop"} section
 * @returns {string[]}
 */
export function extractDefIds(src, section) {
  const marker = `/${section}/`;
  const body = sliceSection(src, marker);
  const ids = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.trim().match(/^<([^>]+)>$/);
    if (m) ids.push(m[1].trim());
  }
  return ids;
}

/**
 * Parts code (engine `kai-swimlane-parts` shape) for a document.
 * @param {string} src full DSL document
 * @param {"block"|"prop"|"both"} [section]
 * @param {string} [onlyId] limit to a single definition id
 * @returns {string} parts fragment, or "" if nothing matched
 */
export function extractPartsCode(src, section = "both", onlyId = null) {
  const pieces = [];
  const want = (s) => section === "both" || section === s;

  if (want("block")) {
    let body = sliceSection(src, "/block/");
    if (onlyId && section === "block") body = sliceDef(body, onlyId);
    if (body) pieces.push(`/block/\n${body}`);
  }
  if (want("prop")) {
    let body = sliceSection(src, "/prop/");
    if (onlyId && section === "prop") body = sliceDef(body, onlyId);
    if (body) pieces.push(`/prop/\n${body}`);
  }
  return pieces.join("\n");
}
