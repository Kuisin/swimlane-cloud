/** @typedef {'fix' | 'continue'} ParseErrorPolicy */

export function errorLineSet(errors) {
  return new Set((errors || []).map((e) => e.line).filter((n) => typeof n === "number" && n > 0));
}

export function hasParseErrors(errors) {
  return Boolean(errors?.length);
}

/** Row indices whose DSL source lines include a parse error. */
export function buildLockedGuiRowIndices(rows, errors) {
  const errorLines = errorLineSet(errors);
  const locked = new Set();
  if (!errorLines.size || !rows?.length) return locked;
  rows.forEach((row, index) => {
    const dslLines = row.dslLines;
    if (!dslLines?.length) return;
    if (dslLines.some((line) => errorLines.has(line))) locked.add(index);
  });
  return locked;
}

/** The rows index whose `dslLines` include `line`, or -1 if none does. */
export function findRowForErrorLine(rows, line) {
  if (!rows?.length || typeof line !== "number" || line <= 0) return -1;
  return rows.findIndex((row) => row.dslLines?.includes(line));
}

/**
 * Tags each error with where it can be fixed from: `{ target: "row",
 * rowIndex }` when it falls on a `/line/` step/branch row's source lines
 * (fixable — or at least locatable — from the flow list), `"definitions"`
 * when it has a line number but no matching row (i.e. `/role/`, `/block/`,
 * `/prop/`, `/option/`, `/page/`, or `/title/` — sections the flow list has
 * no row for), or `"unknown"` when the parser didn't attach a line number
 * at all.
 */
export function classifyErrors(errors, rows) {
  return (errors || []).map((err) => {
    const line = typeof err.line === "number" && err.line > 0 ? err.line : null;
    const rowIndex = line != null ? findRowForErrorLine(rows, line) : -1;
    if (rowIndex >= 0) return { ...err, target: "row", rowIndex };
    return { ...err, target: line != null ? "definitions" : "unknown" };
  });
}

export function isGuiRowEditingLocked(rowIndex, lockedRowIndices) {
  return lockedRowIndices?.has(rowIndex) ?? false;
}

export function mustChooseParseErrorPolicy(errors, policy) {
  return hasParseErrors(errors) && !policy;
}

export function canUseGuiEditing(errors, policy) {
  return !mustChooseParseErrorPolicy(errors, policy);
}
