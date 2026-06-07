import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { tokenizeDslLine } from "../lib/highlight-dsl.js";
import { extractDefIds } from "../lib/parts-extract.js";
import { PartsPreviewTooltip } from "./parts-preview-tooltip.jsx";

/**
 * Plain <textarea> editor with a syntax-highlighted overlay. (Monaco/CodeMirror
 * are not installed in this package.) The coloured <pre> sits *on top* of a
 * transparent-text textarea and is click-through (`pointer-events: none`), so
 * the textarea below stays the editing surface. Only `<block>` / `<prop>` ref
 * tokens opt back into pointer events so they can show a design-preview tooltip
 * on hover — the same native-hover approach the GUI inspector badges use.
 */
export function TextEditor({ value, onChange, readOnly, gotoLine, theme }) {
  const ref = useRef(null);
  const preRef = useRef(null);
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

  // DEBUG: how many hoverable block/prop refs were found in this document.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[ref-hover] block/prop ids:", [...refSections.keys()]);
  }, [refSections]);

  // Keep the (top) <pre> scrolled in lockstep with the (bottom) textarea.
  const syncScroll = useCallback(() => {
    if (preRef.current && ref.current) {
      preRef.current.scrollTop = ref.current.scrollTop;
      preRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }, []);

  // Forward wheel over an interactive ref span to the textarea below so the
  // editor still scrolls when the pointer is on a `<ref>`.
  const forwardWheel = useCallback(
    (e) => {
      const el = ref.current;
      if (!el) return;
      el.scrollTop += e.deltaY;
      el.scrollLeft += e.deltaX;
    },
    [],
  );

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
              const onEnter = (e) => {
                // eslint-disable-next-line no-console
                console.log("[ref-hover] hover triggered:", section, id);
                show(e);
              };
              return (
                <span
                  key={j}
                  className="sw-syn-ref sw-syn-ref-link"
                  onMouseEnter={onEnter}
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

  return (
    <div className="sw-code">
      <textarea
        ref={ref}
        className="sw-code-layer sw-code-input"
        spellCheck={false}
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
      <pre
        className={`sw-code-layer sw-code-highlight${selecting ? " sw-code-selecting" : ""}`}
        ref={preRef}
        aria-hidden
      >
        {highlighted}
      </pre>
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
