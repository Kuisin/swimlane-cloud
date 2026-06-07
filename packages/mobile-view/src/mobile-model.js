import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";

/**
 * Convert the engine's flat parsed model (rows + lanes) into a NESTED,
 * mobile-friendly tree: branches contain cases, cases/groups contain children,
 * steps are leaves. This is the "logic to convert parsed info to mobile
 * components" — kept independent of the SVG renderer and the desktop editor.
 */

const NAMED = {
  blue: "#2563eb",
  green: "#16a34a",
  red: "#dc2626",
  orange: "#ea580c",
  purple: "#7c3aed",
  gray: "#6b7280",
  grey: "#6b7280",
  black: "#111827",
  teal: "#0d9488",
  yellow: "#ca8a04",
  pink: "#db2777",
};

export function toColor(v) {
  if (!v) return null;
  const k = String(v).trim().toLowerCase();
  if (NAMED[k]) return NAMED[k];
  if (/^#?[0-9a-fA-F]{3,8}$/.test(v)) return v.startsWith("#") ? v : `#${v}`;
  return null;
}

function hashColor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}

/** Resolve a lane's accent color (explicit bg, else a stable hashed hue). */
export function roleColor(lane) {
  return toColor(lane?.bg) || hashColor(lane?.id || "role");
}

/** Readable text color (dark/light) for a given background color. */
export function contrastText(color) {
  const hsl = String(color).match(/hsl\(\s*\d+\s+\d+%\s+(\d+)%/);
  if (hsl) return Number(hsl[1]) > 62 ? "#111827" : "#ffffff";
  let hex = String(color).replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

/** Truncate by fullwidth units: CJK = 1, others = 0.5; default cap 4 (≈4 JP chars). */
export function truncateFullwidth(s, max = 4) {
  const str = String(s ?? "");
  let w = 0;
  let out = "";
  for (const ch of str) {
    const fw = /[　-〿぀-ヿ㐀-鿿＀-￯가-힯]/.test(ch)
      ? 1
      : 0.5;
    if (w + fw > max) return `${out}…`;
    w += fw;
    out += ch;
  }
  return out;
}

function stepNode(row, stepIndex) {
  return {
    type: "step",
    stepIndex,
    role: row.role || null,
    text: (row.name || row.text || "").trim(),
    description: (row.description || "").trim(),
    remark: (row.remark || "").trim(),
    props: Array.isArray(row.props) ? row.props : [],
    blockRef: row.blockRef || null,
    arrowLine: row.arrowLine || "solid",
    mergeId: (row.mergeId || "").trim(),
  };
}

/** Build the nested node tree from a parsed model. */
export function buildMobileTree(model) {
  const root = [];
  const stack = [{ container: root, branch: null }];
  const top = () => stack[stack.length - 1];
  let stepCounter = 0;

  const push = (node) => {
    const f = top();
    if (f.branch && !f.container) {
      // step before any explicit case → implicit default case
      const c = { type: "case", label: "", color: null, children: [] };
      f.branch.cases.push(c);
      f.container = c.children;
    }
    (f.container || root).push(node);
  };

  for (const row of model.rows || []) {
    switch (row.kind) {
      case "step":
        if (!row.empty) push(stepNode(row, stepCounter++));
        break;
      case "branchLoop":
        push({ type: "loop" });
        break;
      case "branchMerge":
        push({ type: "merge", target: (row.mergeTarget || "").trim() });
        break;
      case "branchStart": {
        const branch = {
          type: "branch",
          parallel: !!row.parallel,
          cond: (row.cond || "").trim(),
          cases: [],
        };
        push(branch);
        const first = {
          type: "case",
          label: (row.firstCase || "").trim(),
          color: row.branchColor || null,
          children: [],
        };
        branch.cases.push(first);
        stack.push({ branch, container: first.children });
        break;
      }
      case "branchCase": {
        const f = top();
        if (f.branch) {
          const c = {
            type: "case",
            label: (row.label || "").trim(),
            color: row.branchColor || null,
            children: [],
          };
          f.branch.cases.push(c);
          f.container = c.children;
        }
        break;
      }
      case "branchEnd":
        if (top().branch) stack.pop();
        break;
      case "groupStart": {
        const g = {
          type: "group",
          mode: row.groupMode || "branch",
          name: (row.sectionName || "").trim(),
          color: row.sectionColor || null,
          children: [],
        };
        push(g);
        stack.push({ container: g.children, branch: null });
        break;
      }
      case "groupEnd":
        if (stack.length > 1) stack.pop();
        break;
      default:
        break;
    }
  }

  // Map each merge-target id (a step with `id:`) to that step's label, so a
  // mid-flow `merge: <id>` can show where the branch rejoins, not just the id.
  const mergeTargets = {};
  for (const row of model.rows || []) {
    if (row.kind !== "step" || row.empty) continue;
    const id = (row.mergeId || "").trim();
    if (id) mergeTargets[id] = (row.name || row.text || "").trim() || id;
  }

  return {
    title: model.title || "",
    lanes: model.lanes || [],
    blocks: model.blocks || {},
    props: model.props || {},
    nodes: root,
    mergeTargets,
    errors: model.errors || [],
  };
}

/** Convenience: DSL string → { model, tree }. */
export function dslToMobile(dsl) {
  const model = parseDSL(dsl);
  return { model, tree: buildMobileTree(model) };
}
