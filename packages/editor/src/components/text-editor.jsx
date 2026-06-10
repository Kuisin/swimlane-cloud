import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenizeDslLine } from "../lib/highlight-dsl.js";
import { extractDefIds } from "../lib/parts-extract.js";
import { PartsPreviewTooltip } from "./parts-preview-tooltip.jsx";

/**
 * Plain <textarea> editor with a syntax-highlighted overlay and a line-number
 * gutter. (Monaco/CodeMirror are not installed in this package.) The coloured
 * <pre> sits *on top* of a transparent-text textarea and is click-through, so
 * the textarea below stays the editing surface; only `<block>`/`<prop>` ref
 * tokens opt back into pointer events to show a design preview on hover.
 *
 * The editor does NOT soft-wrap (`white-space: pre`, `wrap="off"`): long lines
 * scroll horizontally instead. This keeps the two layers perfectly aligned —
 * soft-wrap made the textarea (which reserves a scrollbar) wrap a few px earlier
 * than the overlay, drifting the colours on wrapped lines — and keeps one line
 * number per logical line.
 */
export function TextEditor({ value, onChange, readOnly, gotoLine, theme, errors }) {
  const ref = useRef(null);
  const preRef = useRef(null);
  const gutterRef = useRef(null);
  const errorLayerRef = useRef(null);
  const [hoverPreview, setHoverPreview] = useState(null);
  // While the mouse button is down, make ref spans click-through so a drag
  // selection passes cleanly through them to the textarea below.
  const [selecting, setSelecting] = useState(false);

  // Best-effort caret jump when the error list selects a line.
  useEffect(() => {
    if (!gotoLine || !ref.current) return;
    const lines = value.split("\n");
    let pos = 0;
    for (let i = 0; i < gotoLine - 1 && i < lines.length; i++) {
      pos += lines[i].length + 1;
    }
    const el = ref.current;
    el.focus();
    el.setSelectionRange(pos, pos + (lines[gotoLine - 1]?.length ?? 0));
  }, [gotoLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearHoverPreview = useCallback(() => setHoverPreview(null), []);

  // Reset the selecting flag on mouse release anywhere.
  useEffect(() => {
    if (!selecting) return undefined;
    const up = () => setSelecting(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [selecting]);

  // Block/prop definition ids -> section, so a `<id>` ref knows what to preview.
  const refSections = useMemo(() => {
    const map = new Map();
    for (const id of extractDefIds(value, "block")) map.set(id, "block");
    for (const id of extractDefIds(value, "prop")) if (!map.has(id)) map.set(id, "prop");
    return map;
  }, [value]);

  const lineCount = useMemo(() => value.split("\n").length, [value]);

  // 1-based line numbers that have at least one parse error.
  const errorLines = useMemo(() => {
    const set = new Set();
    for (const err of errors || []) {
      const line = Number(err?.line);
      if (Number.isInteger(line) && line >= 1 && line <= lineCount) set.add(line);
    }
    return set;
  }, [errors, lineCount]);

  // Keep the (top) <pre> and the gutter scrolled in lockstep with the textarea.
  const syncScroll = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
    if (errorLayerRef.current) errorLayerRef.current.scrollTop = ta.scrollTop;
  }, []);

  // The error layer mounts/unmounts with the first/last error, so re-sync its
  // scroll position whenever the error set changes.
  useEffect(() => {
    syncScroll();
  }, [errorLines, syncScroll]);

  // Forward wheel over an interactive ref span to the textarea below so the
  // editor still scrolls when the pointer is on a `<ref>`.
  const forwardWheel = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop += e.deltaY;
    el.scrollLeft += e.deltaX;
  }, []);

  const highlighted = useMemo(() => {
    const lines = value.split("\n");
    return lines.map((line, i) => (
      <span key={i}>
        {tokenizeDslLine(line).map((tok, j) => {
          if (tok.t === "ref") {
            const m = /^<(.+)>$/.exec(tok.s);
            const id = m ? m[1].trim() : "";
            const section = id && refSections.get(id);
            if (section) {
              const show = (e) =>
                setHoverPreview({ id, section, anchor: { x: e.clientX, y: e.clientY } });
              return (
                <span
                  key={j}
                  className="sw-syn-ref sw-syn-ref-link"
                  onMouseEnter={show}
                  onMouseMove={show}
                  onMouseLeave={clearHoverPreview}
                  onWheel={forwardWheel}
                >
                  {tok.s}
                </span>
              );
            }
          }
          return (
            <span key={j} className={`sw-syn-${tok.t}`}>
              {tok.s}
            </span>
          );
        })}
        {i < lines.length - 1 ? "\n" : ""}
      </span>
    ));
  }, [value, refSections, clearHoverPreview, forwardWheel]);

  const lineNumbers = useMemo(
    () =>
      Array.from({ length: lineCount }, (_, i) => (
        <div
          key={i}
          className={`sw-code-lineno${errorLines.has(i + 1) ? " sw-code-lineno-error" : ""}`}
        >
          {i + 1}
        </div>
      )),
    [lineCount, errorLines],
  );

  return (
    <div className="sw-code">
      <div className="sw-code-gutter" ref={gutterRef} aria-hidden>
        <div className="sw-code-gutter-inner">{lineNumbers}</div>
      </div>
      <div className="sw-code-area">
        {errorLines.size > 0 && (
          <div className="sw-code-layer sw-code-error-layer" ref={errorLayerRef} aria-hidden>
            <div className="sw-code-error-layer-inner" style={{ height: `${lineCount * 1.6}em` }}>
              {[...errorLines].map((line) => (
                <div
                  key={line}
                  className="sw-code-error-line"
                  style={{ top: `${(line - 1) * 1.6}em` }}
                />
              ))}
            </div>
          </div>
        )}
        <pre
          className={`sw-code-layer sw-code-highlight${selecting ? " sw-code-selecting" : ""}`}
          ref={preRef}
          aria-hidden
        >
          {highlighted}
        </pre>
        <textarea
          ref={ref}
          className="sw-code-layer sw-code-input"
          spellCheck={false}
          wrap="off"
          readOnly={readOnly}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onMouseDown={() => {
            setSelecting(true);
            clearHoverPreview();
          }}
          aria-label="DSL source"
        />
      </div>
      <PartsPreviewTooltip
        open={Boolean(hoverPreview)}
        section={hoverPreview?.section}
        src={value}
        theme={theme}
        id={hoverPreview?.id}
        anchor={hoverPreview?.anchor}
      />
    </div>
  );
}
