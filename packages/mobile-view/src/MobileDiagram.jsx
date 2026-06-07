import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Diamond,
  GitBranch,
  GitFork,
  GripVertical,
  Pencil,
  Plus,
  Repeat,
  GitMerge,
  Square,
  Trash2,
} from "lucide-react";
import { arrowLineDasharray } from "@swimlane-cloud/diagram-converter";
import {
  buildMobileTree,
  dslToMobile,
  roleColor,
  contrastText,
  truncateFullwidth,
} from "./mobile-model.js";

/*
 * Self-contained i18n. The package ships its own EN/JA strings (UI chrome that
 * isn't in the host's dictionary) and is driven by a single `lang` prop. The
 * host can still override the action labels via props (`insertStepLabel` etc).
 */
const MESSAGES = {
  en: {
    expand: "Expand",
    collapse: "Collapse",
    empty: "Nothing to show yet.",
    addStep: "Add step",
    insertStep: "Insert step",
    editStep: "Edit step",
    deleteStep: "Delete step",
    noText: "(no text)",
    emptyBlock: "(empty)",
    loop: "loop",
    parallel: "parallel",
    if: "if",
    otherwise: "otherwise",
    section: "section",
    subBranch: "sub-branch",
    case: "case",
    cases: "cases",
    mergeTo: "merges to",
    mergeTarget: "merge point",
    mergeBack: "rejoins main flow",
    dragStep: "drag to reorder",
    parseIssues: (n) => `${n} parse issue${n === 1 ? "" : "s"} — showing what parsed.`,
    path: (n) => `path ${n}`,
    caseN: (n) => `case ${n}`,
  },
  ja: {
    expand: "展開",
    collapse: "折りたたむ",
    empty: "表示する内容がありません。",
    addStep: "ステップを追加",
    insertStep: "ステップを挿入",
    editStep: "ステップを編集",
    deleteStep: "ステップを削除",
    noText: "（テキストなし）",
    emptyBlock: "（空）",
    loop: "ループ",
    parallel: "並列",
    if: "条件分岐",
    otherwise: "それ以外",
    section: "セクション",
    subBranch: "サブ分岐",
    case: "ケース",
    cases: "ケース",
    mergeTo: "合流先",
    mergeTarget: "合流ポイント",
    mergeBack: "本流へ合流",
    dragStep: "ドラッグして並べ替え",
    parseIssues: (n) => `${n} 件の解析エラー — 解析できた範囲を表示しています。`,
    path: (n) => `経路 ${n}`,
    caseN: (n) => `ケース ${n}`,
  },
};

function makeT(lang) {
  const dict = MESSAGES[lang] || MESSAGES.en;
  return (key, ...args) => {
    const v = dict[key] ?? MESSAGES.en[key] ?? key;
    return typeof v === "function" ? v(...args) : v;
  };
}

/**
 * Pointer-based step drag-reorder (works for mouse + touch). Tracks the dragged
 * and hovered `stepIndex` via the `data-step-index` attribute on step cards; on
 * release it asks the host to move from→to (the host validates the move).
 */
/**
 * Find the insertion point nearest the pointer: the step card whose top half the
 * pointer is in (insert *before* it), else the end. Returns the target step index
 * to insert before (`to: null` = end) plus the indicator's screen rect. Driven by
 * the live card geometry, so it's robust to releasing on a connector/gap.
 */
function computeDrop(clientY) {
  const cards = [...document.querySelectorAll("[data-step-index]")];
  if (!cards.length) return null;
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) {
      return { to: Number(card.dataset.stepIndex), top: r.top - 3, left: r.left, width: r.width };
    }
  }
  const last = cards[cards.length - 1].getBoundingClientRect();
  return { to: null, top: last.bottom + 3, left: last.left, width: last.width };
}

function useStepDrag(onMoveStep) {
  const [state, setState] = useState({ from: null, x: 0, y: 0, preview: null, drop: null });

  const start = (e, stepIndex, preview) => {
    if (!onMoveStep) return;
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = "none";
    setState({ from: stepIndex, x: e.clientX, y: e.clientY, preview, drop: computeDrop(e.clientY) });

    const move = (ev) => {
      const drop = computeDrop(ev.clientY);
      setState((s) => ({ ...s, x: ev.clientX, y: ev.clientY, drop }));
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.userSelect = "";
      const drop = computeDrop(ev.clientY);
      setState({ from: null, x: 0, y: 0, preview: null, drop: null });
      if (drop && drop.to !== stepIndex) onMoveStep(stepIndex, drop.to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return { from: state.from, x: state.x, y: state.y, preview: state.preview, drop: state.drop, start };
}

/** The block that floats under the pointer while dragging a step. */
function DragPreview({ drag }) {
  if (drag.from == null || !drag.preview) return null;
  const { text, label, color, textColor } = drag.preview;
  return (
    <div
      className="pointer-events-none fixed z-[100] flex max-w-[320px] items-center gap-2 rounded-xl border-y border-e border-s-4 border-slate-200 bg-white px-3 py-2 shadow-xl"
      style={{
        left: drag.x,
        top: drag.y,
        borderInlineStartColor: color,
        transform: "translate(14px, -50%) rotate(-2deg)",
      }}
      aria-hidden
    >
      {label && (
        <span
          className="shrink-0 rounded-full px-[9px] py-0.5 text-[11px] font-semibold leading-[1.6]"
          style={{ background: color, color: textColor }}
        >
          {label}
        </span>
      )}
      <span className="truncate text-[15px] font-semibold">{text}</span>
    </div>
  );
}

/** Real-time line showing where the dragged step will land. */
function DropIndicator({ drag }) {
  if (drag.from == null || !drag.drop) return null;
  return (
    <div
      className="pointer-events-none fixed z-[90] h-0.5 -translate-y-1/2 rounded-full bg-indigo-500"
      style={{ left: drag.drop.left, top: drag.drop.top, width: drag.drop.width }}
      aria-hidden
    >
      <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-indigo-500" />
    </div>
  );
}

/*
 * Tailwind utility classes (the consuming app owns Tailwind + Preflight). The
 * package ships no stylesheet; saas adds `@source` so these get generated.
 * Repeated/interactive strings are hoisted; structural one-offs stay inline.
 */
const TAP = "[-webkit-tap-highlight-color:transparent]";
const TOOL_CLS = `inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-[7px] text-[12px] text-slate-500 ${TAP} hover:border-indigo-400 hover:text-indigo-600 active:border-indigo-400 active:text-indigo-600`;
const EDIT_CLS = `cursor-pointer inline-flex p-1.5 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ${TAP} hover:bg-indigo-50 hover:text-indigo-600 active:text-indigo-600`;
const DELETE_CLS = `cursor-pointer inline-flex p-1.5 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ${TAP} hover:bg-red-50 hover:text-red-600 active:text-red-600`;
const DRAG_CLS = `inline-flex shrink-0 cursor-grab touch-none items-center justify-center p-1.5 text-slate-400 ${TAP} hover:text-indigo-600 active:cursor-grabbing`;
const INSERT_CLS = `inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-600 ${TAP} hover:border-indigo-400 hover:text-indigo-600 active:border-indigo-400 active:text-indigo-600`;
const ADD_CLS = `flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2.5 text-sm text-slate-600 ${TAP} hover:border-indigo-400 hover:text-indigo-600 active:border-indigo-400 active:text-indigo-600`;
const CHEVRON_CLS = "size-3.5 shrink-0 text-slate-400";
const COUNT_CLS = "ms-auto text-[11px] font-medium text-slate-400";
const EMPTY_SM_CLS = "p-2 text-center text-[12px] text-slate-400";
const HEAD_BASE = `flex w-full cursor-pointer items-center gap-2 text-start ${TAP}`;

/**
 * Mobile-friendly, vertical, card-based render of a kai-swimlane diagram.
 * Blocks collapse by default (tap to expand). `editable` + `onEditStep` show a
 * per-step edit button; the host owns the edit modal + DSL write-back.
 */
export function MobileDiagram({
  dsl,
  model,
  lang = "en",
  editable = false,
  onEditStep,
  onDeleteStep,
  onInsertStep,
  onMoveStep,
  onAddStep,
  insertStepLabel,
  addStepLabel,
}) {
  const t = useMemo(() => makeT(lang), [lang]);
  const drag = useStepDrag(onMoveStep);
  const { tree, laneMap } = useMemo(() => {
    const built = model ? buildMobileTree(model) : dslToMobile(dsl || "").tree;
    const lm = new Map(
      built.lanes.map((l) => [l.id, { ...l, color: roleColor(l) }]),
    );
    return { tree: built, laneMap: lm };
  }, [dsl, model]);

  const insertLabel = insertStepLabel ?? t("insertStep");
  const addLabel = addStepLabel ?? t("addStep");

  // Expand/collapse-all signal: bumping `n` re-syncs every card's open state.
  const [signal, setSignal] = useState({ open: false, n: 0 });
  const ctx = {
    laneMap,
    tree,
    t,
    editable,
    onEditStep,
    onDeleteStep,
    onInsertStep,
    onMoveStep,
    drag,
    insertStepLabel: insertLabel,
    signal,
  };
  const hasError = tree.errors?.length > 0;

  return (
    <div className="min-h-full w-full bg-slate-50">
      <div className="mx-auto max-w-lg px-3 pt-3.5 pb-6 text-slate-900 [-webkit-text-size-adjust:100%]">
        <div className="mx-0.5 mb-3 flex items-center justify-between gap-2">
          {tree.title ? (
            <h1 className="m-0 min-w-0 truncate text-[18px] font-bold">
              {tree.title}
            </h1>
          ) : (
            <span />
          )}
          {tree.nodes.length > 0 && (
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                className={TOOL_CLS}
                onClick={() => setSignal((s) => ({ open: true, n: s.n + 1 }))}
              >
                <ChevronsUpDown size={14} /> {t("expand")}
              </button>
              <button
                type="button"
                className={TOOL_CLS}
                onClick={() => setSignal((s) => ({ open: false, n: s.n + 1 }))}
              >
                <ChevronsDownUp size={14} /> {t("collapse")}
              </button>
            </div>
          )}
        </div>
        {hasError && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] text-red-700">
            {t("parseIssues", tree.errors.length)}
          </div>
        )}
        {tree.nodes.length === 0 ? (
          <div className="p-4 text-center">
            <div className="mb-3 text-[13px] text-slate-400">{t("empty")}</div>
            {editable && onAddStep && (
              <button type="button" className={ADD_CLS} onClick={onAddStep}>
                <Plus size={16} /> {addLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            <NodeList nodes={tree.nodes} ctx={ctx} />
            {editable && onAddStep && (
              <>
                {tree.nodes.length > 0 && <FlowConnector />}
                <button type="button" className={ADD_CLS} onClick={onAddStep}>
                  <Plus size={16} /> {addLabel}
                </button>
              </>
            )}
          </>
        )}
      </div>
      <DropIndicator drag={drag} />
      <DragPreview drag={drag} />
    </div>
  );
}

function NodeList({ nodes, ctx }) {
  return (
    <div className="flex flex-col">
      {nodes.map((n, i) => (
        <div key={i} className="flex flex-col">
          <Node node={n} ctx={ctx} hasNext={i < nodes.length - 1} />
        </div>
      ))}
    </div>
  );
}

const CONNECTOR_STROKE = "#cbd5e1"; // slate-300

/**
 * Vertical flow segment. `lineType` mirrors the step's `arrow:` style (solid /
 * dashed / dotted / long-dash / dash-dot); `head` draws a downward arrowhead so
 * the direction of flow reads at a glance.
 */
function ConnectorLine({ lineType, height, head }) {
  const dash = arrowLineDasharray(lineType) ?? undefined;
  const lineEnd = head ? height - 6 : height;
  return (
    <svg
      width="14"
      height={height}
      viewBox={`0 0 14 ${height}`}
      className="mx-auto block"
      aria-hidden
    >
      <line
        x1="7"
        y1="0"
        x2="7"
        y2={lineEnd}
        stroke={CONNECTOR_STROKE}
        strokeWidth="2"
        strokeDasharray={dash}
      />
      {head && (
        <path
          d={`M7 ${height} L3 ${height - 6} L11 ${height - 6} Z`}
          fill={CONNECTOR_STROKE}
        />
      )}
    </svg>
  );
}

function FlowConnector({ lineType, showInsert, onInsert, label, tail = false }) {
  if (!showInsert) {
    return <ConnectorLine lineType={lineType} height={20} head />;
  }
  return (
    <div className="relative flex flex-col items-center py-0.5">
      <ConnectorLine lineType={lineType} height={10} head={false} />
      <button
        type="button"
        className={`${INSERT_CLS} z-[1] bg-slate-50`}
        onClick={(e) => {
          e.stopPropagation();
          onInsert();
        }}
      >
        <Plus size={14} /> {label}
      </button>
      {!tail && <ConnectorLine height={16} head />}
    </div>
  );
}

function MergeBackConnector({ ctx, hasNext }) {
  if (!hasNext) return <ConnectorLine height={20} head />;
  // A side branch rejoins the main flow before it continues.
  return (
    <div className="flex flex-col items-center py-0.5">
      <ConnectorLine height={8} head={false} />
      <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700">
        <GitMerge size={12} className="shrink-0" /> {ctx.t("mergeBack")}
      </span>
      <ConnectorLine height={14} head />
    </div>
  );
}

function Node({ node, ctx, hasNext = false }) {
  switch (node.type) {
    case "step":
      return <StepCard node={node} ctx={ctx} hasNext={hasNext} />;
    case "branch":
      return (
        <>
          <BranchCard node={node} ctx={ctx} />
          {hasNext && <FlowConnector />}
        </>
      );
    case "group":
      return (
        <>
          <GroupCard node={node} ctx={ctx} />
          {node.mode === "branch" ? (
            <MergeBackConnector ctx={ctx} hasNext={hasNext} />
          ) : (
            hasNext && <FlowConnector />
          )}
        </>
      );
    case "loop":
      return (
        <>
          <span className="inline-flex items-center gap-1 self-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[12px] text-amber-700">
            <Repeat size={13} /> {ctx.t("loop")}
          </span>
          {hasNext && <FlowConnector />}
        </>
      );
    case "merge": {
      const targetLabel = ctx.tree.mergeTargets?.[node.target];
      return (
        <>
          <span
            className="inline-flex max-w-full items-center gap-1.5 self-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[12px] text-teal-700"
            title={node.target}
          >
            <GitMerge size={13} className="shrink-0" />
            <span className="shrink-0">{ctx.t("mergeTo")}</span>
            <span className="truncate font-semibold">{targetLabel || node.target || "?"}</span>
          </span>
          {hasNext && <FlowConnector />}
        </>
      );
    }
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
    <ChevronDown size={14} className={CHEVRON_CLS} />
  ) : (
    <ChevronRight size={14} className={CHEVRON_CLS} />
  );
}

function StepCard({ node, ctx, hasNext = false }) {
  const [open, setOpen] = useSignalOpen(ctx);
  const lane = node.role ? ctx.laneMap.get(node.role) : null;
  const color = lane?.color || "#94a3b8";
  const block = node.blockRef ? ctx.tree.blocks?.[node.blockRef] : null;
  const hasDetail =
    node.description || node.remark || node.props?.length > 0 || block;
  const showInsert = open && ctx.editable && ctx.onInsertStep;
  const isDragging = ctx.drag?.from === node.stepIndex;

  return (
    <>
      <div
        data-step-index={node.stepIndex}
        className={`cursor-pointer rounded-xl border-y border-e border-s-4 border-slate-200 bg-white p-2 transition-shadow duration-200 hover:shadow-md ${
          isDragging ? "opacity-40" : ""
        }`}
        style={{ borderInlineStartColor: color }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 bg-transparent text-start text-inherit"
          >
            {hasDetail ? (
              <Chevron open={open} />
            ) : (
              <span className={CHEVRON_CLS} />
            )}
            {lane && (
              <span
                className="rounded-full px-[9px] py-0.5 text-[11px] font-semibold leading-[1.6]"
                style={{ background: color, color: contrastText(color) }}
                title={lane.label}
              >
                {truncateFullwidth(lane.label, 4)}
              </span>
            )}
            <span className="text-[15px] font-semibold leading-[1.4]">
              {node.text || ctx.t("noText")}
            </span>
          </button>
          {node.mergeId && (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700"
              title={`${ctx.t("mergeTarget")}: ${node.mergeId}`}
            >
              <GitMerge size={11} className="shrink-0" /> {node.mergeId}
            </span>
          )}
          {ctx.editable &&
          (ctx.onMoveStep || ctx.onEditStep || ctx.onDeleteStep) ? (
            <div className="flex shrink-0 items-center">
              {ctx.onMoveStep && (
                <button
                  type="button"
                  className={DRAG_CLS}
                  title={ctx.t("dragStep")}
                  aria-label={ctx.t("dragStep")}
                  onPointerDown={(e) =>
                    ctx.drag.start(e, node.stepIndex, {
                      text: node.text || ctx.t("noText"),
                      label: lane ? truncateFullwidth(lane.label, 4) : null,
                      color,
                      textColor: contrastText(color),
                    })
                  }
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical size={16} />
                </button>
              )}
              {ctx.editable && ctx.onEditStep && (
                <button
                  type="button"
                  className={EDIT_CLS}
                  title={ctx.t("editStep")}
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.onEditStep(node.stepIndex);
                  }}
                >
                  <Pencil size={15} />
                </button>
              )}
              {ctx.editable && ctx.onDeleteStep && (
                <button
                  type="button"
                  className={DELETE_CLS}
                  title={ctx.t("deleteStep")}
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.onDeleteStep(node.stepIndex);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ) : null}
        </div>

        {open && hasDetail && (
          <div className="mt-2 ps-2">
            {block && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-slate-200 bg-slate-100 px-[7px] py-px text-[10px] text-slate-500">
                  {block.label || block.id}
                </span>
              </div>
            )}
            {node.description && (
              <div className="mt-[3px] text-[13px] text-slate-500">
                {node.description}
              </div>
            )}
            {node.remark && (
              <div className="mt-[3px] text-[12px] italic text-slate-400">
                {node.remark}
              </div>
            )}
            {node.props?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-[5px]">
                {node.props.map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-[7px] py-px text-[11px] text-indigo-800"
                  >
                    {ctx.tree.props?.[p]?.label || p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {(hasNext || showInsert) && (
        <FlowConnector
          lineType={node.arrowLine}
          showInsert={showInsert}
          tail={showInsert && !hasNext}
          onInsert={() => ctx.onInsertStep(node.stepIndex)}
          label={ctx.insertStepLabel}
        />
      )}
    </>
  );
}

function BranchCard({ node, ctx }) {
  const [open, setOpen] = useSignalOpen(ctx);
  return (
    <div className="overflow-hidden rounded-xl border border-blue-200 bg-[#f8fbff]">
      <button
        type="button"
        className={`${HEAD_BASE} bg-blue-50 px-3 py-[11px] text-[13px] font-bold text-blue-700`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Chevron open={open} />
        {node.parallel ? <GitFork size={14} /> : <Diamond size={14} />}
        <span>{node.parallel ? ctx.t("parallel") : ctx.t("if")}</span>
        {!node.parallel && node.cond && (
          <span className="font-medium text-blue-800">{node.cond}</span>
        )}
        <span className={COUNT_CLS}>
          {node.cases.length} {ctx.t(node.cases.length === 1 ? "case" : "cases")}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 p-2.5">
          {node.cases.map((c, i) => (
            <div
              key={i}
              className="border-s-2 border-dashed border-blue-200 ps-2.5"
            >
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-blue-600">
                {caseLabel(node, c, i, ctx.t)}
              </div>
              {c.children.length > 0 ? (
                <NodeList nodes={c.children} ctx={ctx} />
              ) : (
                <div className={EMPTY_SM_CLS}>{ctx.t("emptyBlock")}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function caseLabel(branch, c, i, t) {
  if (branch.parallel) return c.label || t("path", i + 1);
  if (/^else$/i.test(c.label)) return t("otherwise");
  return c.label || (i === 0 ? t("case") : t("caseN", i + 1));
}

function GroupCard({ node, ctx }) {
  const [open, setOpen] = useSignalOpen(ctx);
  // A `section` is a neutral grouping box (main flow passes through); a
  // sub-branch (`branch`) is a side branch that diverges and rejoins — give it
  // a distinct violet treatment + branch icon so the two never look alike.
  const isSection = node.mode === "section";
  const wrapCls = isSection
    ? "rounded-xl border border-dashed border-slate-200 p-2"
    : "rounded-xl border border-violet-200 bg-violet-50 p-2";
  const headCls = `${HEAD_BASE} bg-transparent px-1 pt-1.5 pb-2 text-[12px] font-bold ${
    isSection ? "text-slate-500" : "text-violet-700"
  }`;
  return (
    <div className={wrapCls}>
      <button
        type="button"
        className={headCls}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Chevron open={open} />
        {isSection ? <Square size={13} /> : <GitBranch size={13} />}
        <span>{isSection ? ctx.t("section") : ctx.t("subBranch")}</span>
        {node.name && <span className="font-medium">{node.name}</span>}
        <span className={COUNT_CLS}>{node.children.length}</span>
      </button>
      {open &&
        (node.children.length > 0 ? (
          <NodeList nodes={node.children} ctx={ctx} />
        ) : (
          <div className={EMPTY_SM_CLS}>{ctx.t("emptyBlock")}</div>
        ))}
    </div>
  );
}
