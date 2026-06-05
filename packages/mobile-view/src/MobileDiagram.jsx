import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Diamond,
  GitFork,
  Pencil,
  Repeat,
  GitMerge,
  Square,
} from "lucide-react";
import {
  buildMobileTree,
  dslToMobile,
  roleColor,
  contrastText,
  truncateFullwidth,
} from "./mobile-model.js";

/**
 * Mobile-friendly, vertical, card-based render of a kai-swimlane diagram.
 * Blocks collapse by default (tap to expand). `editable` + `onEditStep` show a
 * per-step edit button; the host owns the edit modal + DSL write-back.
 */
export function MobileDiagram({ dsl, model, editable = false, onEditStep }) {
  const { tree, laneMap } = useMemo(() => {
    const t = model ? buildMobileTree(model) : dslToMobile(dsl || "").tree;
    const lm = new Map(t.lanes.map((l) => [l.id, { ...l, color: roleColor(l) }]));
    return { tree: t, laneMap: lm };
  }, [dsl, model]);

  // Expand/collapse-all signal: bumping `n` re-syncs every card's open state.
  const [signal, setSignal] = useState({ open: false, n: 0 });
  const ctx = { laneMap, tree, editable, onEditStep, signal };
  const hasError = tree.errors?.length > 0;

  return (
    <div className="sw-m">
      <div className="sw-m-bar">
        {tree.title ? <h1 className="sw-m-title">{tree.title}</h1> : <span />}
        {tree.nodes.length > 0 && (
          <div className="sw-m-bar-actions">
            <button
              type="button"
              className="sw-m-tool"
              onClick={() => setSignal((s) => ({ open: true, n: s.n + 1 }))}
            >
              <ChevronsUpDown size={14} /> Expand
            </button>
            <button
              type="button"
              className="sw-m-tool"
              onClick={() => setSignal((s) => ({ open: false, n: s.n + 1 }))}
            >
              <ChevronsDownUp size={14} /> Collapse
            </button>
          </div>
        )}
      </div>
      {hasError && (
        <div className="sw-m-error">
          {tree.errors.length} parse issue{tree.errors.length === 1 ? "" : "s"} —
          showing what parsed.
        </div>
      )}
      {tree.nodes.length === 0 ? (
        <div className="sw-m-empty">Nothing to show yet.</div>
      ) : (
        <NodeList nodes={tree.nodes} ctx={ctx} />
      )}
    </div>
  );
}

function NodeList({ nodes, ctx }) {
  return (
    <div className="sw-m-list">
      {nodes.map((n, i) => (
        <div key={i} className="sw-m-item">
          {i > 0 && <div className="sw-m-connector" aria-hidden />}
          <Node node={n} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

function Node({ node, ctx }) {
  switch (node.type) {
    case "step":
      return <StepCard node={node} ctx={ctx} />;
    case "branch":
      return <BranchCard node={node} ctx={ctx} />;
    case "group":
      return <GroupCard node={node} ctx={ctx} />;
    case "loop":
      return (
        <span className="sw-m-pill sw-m-pill-loop">
          <Repeat size={13} /> loop
        </span>
      );
    case "merge":
      return (
        <span className="sw-m-pill sw-m-pill-merge">
          <GitMerge size={13} /> {node.target || "?"}
        </span>
      );
    default:
      return null;
  }
}

function useSignalOpen(ctx) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(ctx.signal.open);
  }, [ctx.signal.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return [open, setOpen];
}

function Chevron({ open }) {
  return open ? (
    <ChevronDown size={14} className="sw-m-chevron" />
  ) : (
    <ChevronRight size={14} className="sw-m-chevron" />
  );
}

function StepCard({ node, ctx }) {
  const [open, setOpen] = useSignalOpen(ctx);
  const lane = node.role ? ctx.laneMap.get(node.role) : null;
  const color = lane?.color || "#94a3b8";
  const block = node.blockRef ? ctx.tree.blocks?.[node.blockRef] : null;
  const hasDetail =
    node.description || node.remark || node.props?.length > 0 || block || node.mergeId;

  return (
    <div className="sw-m-card" style={{ borderInlineStartColor: color }}>
      <div className="sw-m-card-row">
        <button
          type="button"
          className="sw-m-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {hasDetail ? <Chevron open={open} /> : <span className="sw-m-chevron" />}
          {lane && (
            <span
              className="sw-m-chip"
              style={{ background: color, color: contrastText(color) }}
              title={lane.label}
            >
              {truncateFullwidth(lane.label, 4)}
            </span>
          )}
          <span className="sw-m-text">{node.text || "(no text)"}</span>
        </button>
        {ctx.editable && ctx.onEditStep && (
          <button
            type="button"
            className="sw-m-edit"
            title="Edit step"
            onClick={(e) => {
              e.stopPropagation();
              ctx.onEditStep(node.stepIndex);
            }}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>

      {open && hasDetail && (
        <div className="sw-m-detail">
          <div className="sw-m-card-head">
            {block && <span className="sw-m-badge">{block.label || block.id}</span>}
            {node.arrowLine === "dashed" && <span className="sw-m-badge">dashed</span>}
            {node.mergeId && <span className="sw-m-id">#{node.mergeId}</span>}
          </div>
          {node.description && <div className="sw-m-desc">{node.description}</div>}
          {node.remark && <div className="sw-m-remark">{node.remark}</div>}
          {node.props?.length > 0 && (
            <div className="sw-m-props">
              {node.props.map((p) => (
                <span key={p} className="sw-m-prop">
                  {ctx.tree.props?.[p]?.label || p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BranchCard({ node, ctx }) {
  const [open, setOpen] = useSignalOpen(ctx);
  return (
    <div className="sw-m-branch">
      <button
        type="button"
        className="sw-m-branch-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Chevron open={open} />
        {node.parallel ? <GitFork size={14} /> : <Diamond size={14} />}
        <span>{node.parallel ? "parallel" : "if"}</span>
        {!node.parallel && node.cond && (
          <span className="sw-m-branch-cond">{node.cond}</span>
        )}
        <span className="sw-m-count">
          {node.cases.length} {node.cases.length === 1 ? "case" : "cases"}
        </span>
      </button>
      {open && (
        <div className="sw-m-cases">
          {node.cases.map((c, i) => (
            <div key={i} className="sw-m-case">
              <div className="sw-m-case-label">{caseLabel(node, c, i)}</div>
              {c.children.length > 0 ? (
                <NodeList nodes={c.children} ctx={ctx} />
              ) : (
                <div className="sw-m-empty-sm">(empty)</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function caseLabel(branch, c, i) {
  if (branch.parallel) return c.label || `path ${i + 1}`;
  if (/^else$/i.test(c.label)) return "otherwise";
  return c.label || (i === 0 ? "case" : `case ${i + 1}`);
}

function GroupCard({ node, ctx }) {
  const [open, setOpen] = useSignalOpen(ctx);
  return (
    <div className="sw-m-group">
      <button
        type="button"
        className="sw-m-group-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Chevron open={open} />
        <Square size={13} />
        <span>{node.mode === "section" ? "section" : "sub-branch"}</span>
        {node.name && <span className="sw-m-group-name">{node.name}</span>}
        <span className="sw-m-count">{node.children.length}</span>
      </button>
      {open &&
        (node.children.length > 0 ? (
          <NodeList nodes={node.children} ctx={ctx} />
        ) : (
          <div className="sw-m-empty-sm">(empty)</div>
        ))}
    </div>
  );
}
