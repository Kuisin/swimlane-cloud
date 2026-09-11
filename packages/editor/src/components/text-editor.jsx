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
 *
 * The overlay, gutter and error stripes follow the textarea's scroll by a
 * `transform`, not by scrolling themselves. Their own scroll range is shorter
 * than the textarea's — a trailing newline gives the textarea one more line
 * than a `<pre>` shows, and the textarea's scrollbars shrink its viewport —
 * so `scrollTop = ta.scrollTop` clamps near the end and the caret sits a line
 * away from the colours it belongs to.
 */
export function TextEditor({ value, onChange, readOnly, gotoLine, theme, errors }) {
  const ref = useRef(null);
  const highlightShiftRef = useRef(null);
  const gutterShiftRef = useRef(null);
  const errorShiftRef = useRef(null);
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

  // Keep the highlight layer, gutter and error stripes in lockstep with the
  // textarea by translating their content by exactly its scroll offset.
  const syncScroll = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;
    const both = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    const vertical = `translateY(${-ta.scrollTop}px)`;
    if (highlightShiftRef.current) highlightShiftRef.current.style.transform = both;
    if (gutterShiftRef.current) gutterShiftRef.current.style.transform = vertical;
    if (errorShiftRef.current) errorShiftRef.current.style.transform = vertical;
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
      <div className="sw-code-gutter" aria-hidden>
        <div className="sw-code-gutter-inner" ref={gutterShiftRef}>
          {lineNumbers}
        </div>
      </div>
      <div className="sw-code-area">
        {errorLines.size > 0 && (
          <div className="sw-code-layer sw-code-error-layer" aria-hidden>
            <div
              className="sw-code-error-layer-inner"
              ref={errorShiftRef}
              style={{ height: `${lineCount * 1.6}em` }}
            >
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
        <div
          className={`sw-code-layer sw-code-highlight${selecting ? " sw-code-selecting" : ""}`}
          aria-hidden
        >
          {/* The trailing "\n" makes a value that ends in a newline render its
              final empty line, as the textarea does; a lone trailing newline
              adds no line of its own. */}
          <div className="sw-code-shift" ref={highlightShiftRef}>
            {highlighted}
            {"\n"}
          </div>
        </div>
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
