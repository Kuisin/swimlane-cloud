import { useT } from "../../i18n.jsx";

/**
 * Grouped, plain-language "Add" picker for the flow-control constructs. The
 * five options used to be a flat list of jargon labels (If/Switch/Fork/
 * Section/Branch) with no indication that "Section" and "Branch" sound like
 * synonyms but have very different meanings (see dsl-rule.md's `section`
 * vs. `branch`). Grouping by what actually differs — one path vs. all paths
 * vs. purely visual vs. a side path — plus a one-line description per item
 * makes the distinction legible without requiring the DSL vocabulary.
 */
export function AddStepMenu({
  position,
  onClose,
  onAddIf,
  onAddSwitch,
  onAddFork,
  onAddSection,
  onAddBranch,
}) {
  const { t } = useT();
  const groups = [
    {
      headingKey: "gui.addGroupDecision",
      items: [
        { key: "if", labelKey: "gui.addIf", descKey: "gui.addIfDesc", onSelect: onAddIf },
        {
          key: "switch",
          labelKey: "gui.addSwitch",
          descKey: "gui.addSwitchDesc",
          onSelect: onAddSwitch,
        },
      ],
    },
    {
      headingKey: "gui.addGroupParallel",
      items: [
        { key: "fork", labelKey: "gui.addFork", descKey: "gui.addForkDesc", onSelect: onAddFork },
      ],
    },
    {
      headingKey: "gui.addGroupVisual",
      items: [
        {
          key: "section",
          labelKey: "gui.addSection",
          descKey: "gui.addSectionDesc",
          onSelect: onAddSection,
        },
      ],
    },
    {
      headingKey: "gui.addGroupSidePath",
      items: [
        {
          key: "branch",
          labelKey: "gui.addBranch",
          descKey: "gui.addBranchDesc",
          onSelect: onAddBranch,
        },
      ],
    },
  ];

  return (
    <div
      className="sw-add-block-menu"
      style={{ top: position.top, left: position.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {groups.map((group) => (
        <div key={group.headingKey} className="sw-add-block-group">
          <div className="sw-add-block-group-heading">{t(group.headingKey)}</div>
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="sw-add-block-item"
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              <span className="sw-add-block-item-label">{t(item.labelKey)}</span>
              <span className="sw-add-block-item-desc">{t(item.descKey)}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
