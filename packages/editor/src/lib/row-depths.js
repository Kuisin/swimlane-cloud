/**
 * Indentation for every flow row, derived from how the rows nest rather than
 * from the `depth` a parser stamped on each one.
 *
 * The parsers track branches (if/fork) and groups (section/branch) on two
 * separate stacks, and for a long time each stack only looked at itself — an
 * `if` opened inside a `section` was written at column 0, and the step inside
 * it one level too shallow. Walking the rows here with one stack makes the
 * serialized layout follow the actual structure, whatever depths the rows
 * carry, so a GUI edit and a Format both produce the same text.
 *
 * `depth` is where a row's own content sits: steps, jumps, group markers and
 * the body of a case. `controlDepth` is where a branch's own lines sit — its
 * opener, each case, and its closer share one column, one level shallower
 * than the case bodies.
 */
export function computeRowDepths(rows) {
  const out = new Array(rows.length);
  const frames = [];
  let body = 0;

  const popTo = (kind, id) => {
    for (let k = frames.length - 1; k >= 0; k--) {
      if (frames[k].kind === kind && frames[k].id === id) {
        const frame = frames[k];
        frames.length = k;
        return frame;
      }
    }
    return null;
  };
  const findBranch = (id) => {
    for (let k = frames.length - 1; k >= 0; k--) {
      if (frames[k].kind === "branch" && frames[k].id === id) {
        // A group left open inside the previous case cannot outlive it.
        frames.length = k + 1;
        return frames[k];
      }
    }
    return null;
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    switch (row.kind) {
      case "branchStart": {
        out[i] = { depth: body, controlDepth: body };
        frames.push({ kind: "branch", id: row.id, depth: body });
        body += 1;
        break;
      }
      case "branchCase": {
        const frame = findBranch(row.id);
        const d = frame ? frame.depth : Math.max(0, body - 1);
        out[i] = { depth: d + 1, controlDepth: d };
        body = d + 1;
        break;
      }
      case "branchEnd": {
        const frame = popTo("branch", row.id);
        const d = frame ? frame.depth : Math.max(0, body - 1);
        out[i] = { depth: d, controlDepth: d };
        body = d;
        break;
      }
      case "groupStart": {
        out[i] = { depth: body, controlDepth: body };
        frames.push({ kind: "group", id: row.id, depth: body });
        body += 1;
        break;
      }
      case "groupEnd": {
        const frame = popTo("group", row.id);
        const d = frame ? frame.depth : Math.max(0, body - 1);
        out[i] = { depth: d, controlDepth: d };
        body = d;
        break;
      }
      default:
        out[i] = { depth: body, controlDepth: body };
    }
  }
  return out;
}
