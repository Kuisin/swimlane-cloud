/** Quick counts for the action bar status line. */
export function modelCounts(model) {
  if (!model) return { roles: 0, blocks: 0, props: 0, steps: 0 };
  const steps = (model.rows || []).filter(
    (r) => r.kind === "step" && !r.empty && r.role,
  ).length;
  return {
    roles: (model.lanes || []).length,
    blocks: Object.keys(model.blocks || {}).length,
    props: Object.keys(model.props || {}).length,
    steps,
  };
}
