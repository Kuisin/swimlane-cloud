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

  return {
    title: model.title || "",
    lanes: model.lanes || [],
    blocks: model.blocks || {},
    props: model.props || {},
    nodes: root,
    errors: model.errors || [],
  };
}

/** Convenience: DSL string → { model, tree }. */
export function dslToMobile(dsl) {
  const model = parseDSL(dsl);
  return { model, tree: buildMobileTree(model) };
}
