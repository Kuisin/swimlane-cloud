/** @typedef {string | number | boolean | null | undefined | SvgNode | SvgNode[]} SvgNode */

/**
 * Escape text for SVG/HTML text nodes and attribute values.
 * @param {unknown} value
 */
export function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {unknown} value
 */
export function escapeAttr(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, unknown>} style
 */
export function styleObjectToString(style) {
  return Object.entries(style)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
      return `${prop}:${v}`;
    })
    .join(";");
}

// React uses camelCase for SVG presentation attributes; SVG/HTML serialization
// requires their kebab-case equivalents. viewBox/patternUnits/markerWidth etc.
// are kept as-is because they are camelCase in the SVG spec itself.
const SVG_ATTR_MAP = {
  className: "class",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fillRule: "fill-rule",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontStyle: "font-style",
  fontWeight: "font-weight",
  letterSpacing: "letter-spacing",
  markerEnd: "marker-end",
  markerMid: "marker-mid",
  markerStart: "marker-start",
  pointerEvents: "pointer-events",
  stopColor: "stop-color",
  stopOpacity: "stop-opacity",
  strokeDasharray: "stroke-dasharray",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textAnchor: "text-anchor",
  textDecoration: "text-decoration",
  vectorEffect: "vector-effect",
};

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [attrs]
 * @param {SvgNode | SvgNode[]} [children]
 */
export function el(tag, attrs = {}, children = "") {
  const parts = [`<${tag}`];
  for (const [key, rawValue] of Object.entries(attrs)) {
    if (rawValue == null || rawValue === false) continue;
    if (key === "children") continue;
    if (key === "key") continue;
    if (key.startsWith("on")) continue;
    if (key === "style" && rawValue && typeof rawValue === "object") {
      parts.push(` style="${escapeAttr(styleObjectToString(/** @type {Record<string, unknown>} */ (rawValue)))}"`);
      continue;
    }
    const attrName = SVG_ATTR_MAP[key] ?? key;
    if (rawValue === true) {
      parts.push(` ${attrName}`);
      continue;
    }
    parts.push(` ${attrName}="${escapeAttr(rawValue)}"`);
  }
  const childStr = join(Array.isArray(children) ? children : [children]);
  if (!childStr && /^(?:path|rect|circle|ellipse|line|polygon|polyline|use|image|text|tspan|title)$/.test(tag)) {
    return `${parts.join("")} />`;
  }
  return `${parts.join("")}>${childStr}</${tag}>`;
}

/**
 * @param {SvgNode | SvgNode[]} nodes
 */
export function join(nodes) {
  return (Array.isArray(nodes) ? nodes : [nodes])
    .flat(Infinity)
    .filter((node) => node != null && node !== false)
    .join("");
}

/** Fragment marker for JSX factory output. */
export const Fragment = Symbol("Fragment");

/**
 * JSX factory — mirrors React.createElement but returns SVG/HTML strings.
 * @param {string | symbol | ((props: Record<string, unknown>) => SvgNode)} type
 * @param {Record<string, unknown> | null} props
 * @param {...SvgNode} children
 */
export function h(type, props, ...children) {
  if (type === Fragment) {
    const flat = props?.children != null ? [props.children, ...children] : children;
    return join(flat);
  }
  if (typeof type === "function") {
    const merged = { ...(props || {}), children: children.length ? children : props?.children };
    return type(merged);
  }
  const attrs = { ...(props || {}) };
  const propChildren = attrs.children;
  delete attrs.children;
  const allChildren =
    children.length > 0 ? children : propChildren != null ? [propChildren] : [];
  return el(String(type), attrs, join(allChildren));
}

/** @type {typeof h} */
export function jsx(type, props, key) {
  void key;
  return h(type, props);
}

/** @type {typeof h} */
export function jsxs(type, props, key) {
  void key;
  return h(type, props);
}
