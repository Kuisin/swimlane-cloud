import { useMemo } from "react";
import { buildMobileTree, dslToMobile, roleColor } from "./mobile-model.js";

/**
 * Mobile-friendly, vertical, card-based render of a kai-swimlane diagram.
 * Pass `dsl` (string) or a pre-parsed `model`. Read-only for now — a base for a
 * future mobile editor.
 */
export function MobileDiagram({ dsl, model }) {
  const { tree, laneMap } = useMemo(() => {
    const t = model ? buildMobileTree(model) : dslToMobile(dsl || "").tree;
    const lm = new Map(t.lanes.map((l) => [l.id, { ...l, color: roleColor(l) }]));
    return { tree: t, laneMap: lm };
  }, [dsl, model]);

  const hasError = tree.errors?.length > 0;

  return (
    <div className="sw-m">
      {tree.title && <h1 className="sw-m-title">{tree.title}</h1>}
      {hasError && (
        <div className="sw-m-error">
          {tree.errors.length} parse issue{tree.errors.length === 1 ? "" : "s"} —
          showing what parsed.
        </div>
      )}
      {tree.nodes.length === 0 ? (
        <div className="sw-m-empty">Nothing to show yet.</div>
      ) : (
        <NodeList nodes={tree.nodes} laneMap={laneMap} tree={tree} />
      )}
    </div>
  );
}

function NodeList({ nodes, laneMap, tree }) {
  return (
    <div className="sw-m-list">
      {nodes.map((n, i) => (
        <div key={i} className="sw-m-item">
          {i > 0 && <div className="sw-m-connector" aria-hidden />}
          <Node node={n} laneMap={laneMap} tree={tree} />
        </div>
      ))}
    </div>
  );
}

function Node({ node, laneMap, tree }) {
  switch (node.type) {
    case "step":
      return <StepCard node={node} laneMap={laneMap} tree={tree} />;
    case "branch":
      return <BranchCard node={node} laneMap={laneMap} tree={tree} />;
    case "group":
      return <GroupCard node={node} laneMap={laneMap} tree={tree} />;
    case "loop":
      return <span className="sw-m-pill sw-m-pill-loop">⟳ loop</span>;
    case "merge":
      return (
        <span className="sw-m-pill sw-m-pill-merge">
          merge → {node.target || "?"}
        </span>
      );
    default:
      return null;
  }
}

function StepCard({ node, laneMap, tree }) {
  const lane = node.role ? laneMap.get(node.role) : null;
  const color = lane?.color || "#94a3b8";
  const block = node.blockRef ? tree.blocks?.[node.blockRef] : null;
  return (
    <div className="sw-m-card" style={{ borderInlineStartColor: color }}>
      <div className="sw-m-card-head">
        {lane && (
          <span className="sw-m-chip" style={{ background: color }}>
            {lane.icon ? `${lane.icon} ` : ""}
            {lane.label}
          </span>
        )}
        {block && (
          <span className="sw-m-badge">{block.label || block.id}</span>
        )}
        {node.arrowLine === "dashed" && <span className="sw-m-badge">dashed</span>}
        {node.mergeId && <span className="sw-m-id">#{node.mergeId}</span>}
      </div>
      <div className="sw-m-text">{node.text || "(no text)"}</div>
      {node.description && <div className="sw-m-desc">{node.description}</div>}
      {node.remark && <div className="sw-m-remark">{node.remark}</div>}
      {node.props?.length > 0 && (
        <div className="sw-m-props">
          {node.props.map((p) => (
            <span key={p} className="sw-m-prop">
              {tree.props?.[p]?.label || p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BranchCard({ node, laneMap, tree }) {
  return (
    <div className="sw-m-branch">
      <div className="sw-m-branch-head">
        {node.parallel ? "▥ parallel" : "◇ if"}
        {!node.parallel && node.cond && (
          <span className="sw-m-branch-cond">{node.cond}</span>
        )}
      </div>
      <div className="sw-m-cases">
        {node.cases.map((c, i) => (
          <div key={i} className="sw-m-case">
            <div className="sw-m-case-label">
              {caseLabel(node, c, i)}
            </div>
            {c.children.length > 0 ? (
              <NodeList nodes={c.children} laneMap={laneMap} tree={tree} />
            ) : (
              <div className="sw-m-empty-sm">(empty)</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function caseLabel(branch, c, i) {
  if (branch.parallel) return c.label || `path ${i + 1}`;
  if (/^else$/i.test(c.label)) return "otherwise";
  return c.label || (i === 0 ? "case" : `case ${i + 1}`);
}

function GroupCard({ node, laneMap, tree }) {
  return (
    <div className="sw-m-group">
      <div className="sw-m-group-head">
        {node.mode === "section" ? "▦ section" : "▸ sub-branch"}
        {node.name && <span className="sw-m-group-name">{node.name}</span>}
      </div>
      {node.children.length > 0 ? (
        <NodeList nodes={node.children} laneMap={laneMap} tree={tree} />
      ) : (
        <div className="sw-m-empty-sm">(empty)</div>
      )}
    </div>
  );
}
