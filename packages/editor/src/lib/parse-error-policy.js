/** @typedef {'fix' | 'continue'} ParseErrorPolicy */

export function errorLineSet(errors) {
  return new Set(
    (errors || [])
      .map((e) => e.line)
      .filter((n) => typeof n === "number" && n > 0),
  );
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

export function isGuiRowEditingLocked(rowIndex, lockedRowIndices) {
  return lockedRowIndices?.has(rowIndex) ?? false;
}

export function mustChooseParseErrorPolicy(errors, policy) {
  return hasParseErrors(errors) && !policy;
}

export function canUseGuiEditing(errors, policy) {
  return !mustChooseParseErrorPolicy(errors, policy);
}
