import { useEffect, useRef } from "react";

/**
 * Plain styled <textarea> text editor. (Monaco/CodeMirror are not installed in
 * this package, so text mode uses a textarea per the build constraints.)
 */
export function TextEditor({ value, onChange, readOnly, gotoLine }) {
  const ref = useRef(null);

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

  return (
    <textarea
      ref={ref}
      className="sw-textarea"
      spellCheck={false}
      readOnly={readOnly}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="DSL source"
    />
  );
}
