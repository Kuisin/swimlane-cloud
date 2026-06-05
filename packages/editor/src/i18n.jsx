import { createContext, useContext, useMemo, useState } from "react";

/**
 * Lightweight i18n for the editor surface. Two languages ship today — English
 * and Japanese — but the dictionary shape is open for more. Components read the
 * active language via `useT()`; pure helpers (e.g. flow-rows) accept a `t`
 * function and fall back to English via `tr(EN, ...)`.
 */

export const EN = {
  // action bar
  "action.newFile": "New file",
  "action.newFolder": "New folder",
  "action.templates": "Templates",
  "action.format": "Format",
  "action.export": "Export",
  "action.exportTitle": "Export diagram",
  "action.exportTxt": "Export as .txt",
  "action.exportSvg": "Export as .svg",
  "action.exportPng": "Export as .png",
  "action.help": "Help",
  "action.version": "Version",
  "action.versionTitle": "Flag new version",
  "action.checkpoint": "Checkpoint",
  "action.saveAll": "Save all",
  "action.save": "Save",
  "action.saveDirty": "Save *",
  "counts.roles": "{n} roles",
  "counts.blocks": "{n} blocks",
  "counts.steps": "{n} steps",
  // language
  "lang.label": "Language",
  // mode toggle
  "mode.gui": "GUI",
  "mode.text": "Text",
  "mode.guiTitle": "GUI editing",
  "mode.guiDisabled": "Fix parse errors to use GUI mode",
  // tabs / common
  "tab.close": "Close",
  "common.unsaved": "unsaved",
  "common.loading": "Loading…",
  "common.delete": "Delete",
  // tree
  "tree.files": "Files",
  "tree.noFiles": "No files",
  // errors
  "errors.title": "Parse errors",
  // gui
  "gui.flow": "Flow",
  "gui.addStep": "Add step",
  "gui.selectRow": "Select a row to edit it.",
  "gui.selectStep": "Select a step to edit it.",
  "gui.noRows": "No flow rows yet. Add a step below.",
  "gui.newStepText": "New step",
  "gui.openFile": "Open or create a file to start.",
  // step inspector
  "step.title": "Step",
  "step.moveUp": "Move up",
  "step.moveDown": "Move down",
  "step.delete": "Delete step",
  "step.role": "Role (lane)",
  "step.chooseRole": "(choose a role)",
  "step.text": "Text",
  "step.label": "Label (optional)",
  "step.description": "Description",
  "step.remark": "Remark",
  "step.block": "Block style",
  "step.none": "(none)",
  "step.arrow": "Arrow",
  "step.mergeId": "Merge id (optional)",
  "step.props": "Props",
  "step.viewDesign": "View design",
  "step.moveTo": "Move to…",
  // step list badges (type tags)
  "badge.step": "step",
  "badge.blank": "blank",
  "badge.if": "if",
  "badge.case": "case",
  "badge.else": "else",
  "badge.and": "and",
  "badge.fork": "fork",
  "badge.endif": "endif",
  "badge.endfork": "endfork",
  "badge.loop": "loop",
  "badge.merge": "merge",
  "badge.branch": "branch",
  "badge.section": "section",
  "badge.endBranch": "end-branch",
  "badge.endSection": "end-section",
  "badge.row": "row",
  // move-step modal
  "move.title": "Move step",
  "move.hint": "Pick where this step should go within its branch.",
  "move.current": "current",
  "move.position": "Position {n}",
  "move.toEnd": "Move to end",
  "move.empty": "No other positions in this branch.",
  "arrow.solid": "solid",
  "arrow.dashed": "dashed",
  "arrow.none": "none",
  // branch inspector
  "branch.fork": "Parallel (fork)",
  "branch.if": "Branch (if)",
  "branch.parallelPath": "Parallel path",
  "branch.case": "Case",
  "branch.section": "Section",
  "branch.subbranch": "Sub-branch",
  "branch.row": "Row",
  "branch.condition": "Condition",
  "branch.caseLabel": "Case label",
  "branch.name": "Name",
  "branch.accent": "Accent color",
  "branch.default": "(default)",
  // color
  "color.presets": "presets…",
  // preview
  "preview.fixErrors": "Fix parse errors to see the preview.",
  "preview.empty": "No diagram yet.",
  "preview.label": "Diagram preview",
  // help
  "help.title": "DSL quick reference",
  "help.markers": "Every document is wrapped in these markers.",
  "help.title2": "One line: the diagram title.",
  "help.page": "description / header-* / footer-* metadata.",
  "help.option": "Diagram options and gutter column titles.",
  "help.role": "Lanes: <id> then label:, background-color:, text-color:, icon:.",
  "help.block": "Reusable step styles referenced as [role: text] <blockId>.",
  "help.prop": "Side annotations attached to steps via props: a,b;.",
  "help.line":
    "The flow. [role: text] steps, if / elseif / else / endif, fork / and / endfork, branch / end-branch, section / end-section, merge: id;, [loop].",
  // template panel
  "tpl.title": "Section templates",
  "tpl.forced":
    "This section is forced by the project policy. New diagrams inherit it automatically and manual inserts are disabled.",
  "tpl.noHost": "This host does not provide section templates.",
  "tpl.none": "No templates for this section.",
  "tpl.insert": "Insert",
  "tpl.default": "default",
  "tpl.loadError": "Could not load templates",
  // parts preview popup
  "parts.blockTitle": "Block designs",
  "parts.propTitle": "Prop designs",
  "parts.selected": "Selected: {id}",
  "parts.showAll": "Show all",
  "parts.showSelected": "Show selected",
  "parts.none": "No designs defined yet.",
  // dialogs
  "dlg.cannotFormat": "Cannot format: fix parse errors first.",
  "dlg.checkpointMsg": "Checkpoint message (optional)",
  "dlg.versionName": "Version name",
  "dlg.versionFail": "Could not flag version.",
  "dlg.templateFail": "Could not insert template.",
  // flow summaries
  "flow.blankLine": "(blank line)",
  "flow.noText": "(no text)",
  "flow.noRole": "(no role)",
  "flow.parallelFork": "parallel (fork)",
  "flow.condition": "condition",
  "flow.parallelPath": "parallel path",
  "flow.otherwise": "otherwise",
  "flow.case": "case",
  "flow.endParallel": "end of parallel",
  "flow.endBranch": "end of branch",
  "flow.loopInBranch": "loop within branch",
  "flow.mergeTo": "merge → {id}",
  "flow.unset": "(unset)",
  "flow.subbranch": "sub-branch",
  "flow.sectionBox": "section box",
  "flow.endSubbranch": "end of sub-branch",
  "flow.endSection": "end of section",
  "flow.stepN": "Step {n}",
  // fatal
  "fatal.load": "Failed to load: {msg}",
};

export const JA = {
  // action bar
  "action.newFile": "新規ファイル",
  "action.newFolder": "新規フォルダ",
  "action.templates": "テンプレート",
  "action.format": "整形",
  "action.export": "書き出し",
  "action.exportTitle": "図を書き出し",
  "action.exportTxt": ".txt で書き出し",
  "action.exportSvg": ".svg で書き出し",
  "action.exportPng": ".png で書き出し",
  "action.help": "ヘルプ",
  "action.version": "バージョン",
  "action.versionTitle": "新しいバージョンを登録",
  "action.checkpoint": "チェックポイント",
  "action.saveAll": "すべて保存",
  "action.save": "保存",
  "action.saveDirty": "保存 *",
  "counts.roles": "ロール {n}",
  "counts.blocks": "ブロック {n}",
  "counts.steps": "ステップ {n}",
  // language
  "lang.label": "言語",
  // mode toggle
  "mode.gui": "GUI",
  "mode.text": "テキスト",
  "mode.guiTitle": "GUI編集",
  "mode.guiDisabled": "構文エラーを修正するとGUIが使えます",
  // tabs / common
  "tab.close": "閉じる",
  "common.unsaved": "未保存",
  "common.loading": "読み込み中…",
  "common.delete": "削除",
  // tree
  "tree.files": "ファイル",
  "tree.noFiles": "ファイルなし",
  // errors
  "errors.title": "構文エラー",
  // gui
  "gui.flow": "フロー",
  "gui.addStep": "ステップを追加",
  "gui.selectRow": "編集する行を選択してください。",
  "gui.selectStep": "編集するステップを選択してください。",
  "gui.noRows": "フロー行がまだありません。下からステップを追加してください。",
  "gui.newStepText": "新しいステップ",
  "gui.openFile": "ファイルを開くか作成して始めましょう。",
  // step inspector
  "step.title": "ステップ",
  "step.moveUp": "上へ移動",
  "step.moveDown": "下へ移動",
  "step.delete": "ステップを削除",
  "step.role": "ロール（レーン）",
  "step.chooseRole": "（ロールを選択）",
  "step.text": "テキスト",
  "step.label": "ラベル（任意）",
  "step.description": "説明",
  "step.remark": "備考",
  "step.block": "ブロックスタイル",
  "step.none": "（なし）",
  "step.arrow": "矢印",
  "step.mergeId": "マージID（任意）",
  "step.props": "プロップ",
  "step.viewDesign": "デザインを見る",
  "step.moveTo": "位置を移動…",
  // step list badges (type tags)
  "badge.step": "ステップ",
  "badge.blank": "空行",
  "badge.if": "分岐",
  "badge.case": "ケース",
  "badge.else": "その他",
  "badge.and": "並列",
  "badge.fork": "フォーク",
  "badge.endif": "分岐終",
  "badge.endfork": "並列終",
  "badge.loop": "ループ",
  "badge.merge": "マージ",
  "badge.branch": "サブ分岐",
  "badge.section": "セクション",
  "badge.endBranch": "サブ分岐終",
  "badge.endSection": "セクション終",
  "badge.row": "行",
  // move-step modal
  "move.title": "ステップを移動",
  "move.hint": "分岐内のどこに移動するか選んでください。",
  "move.current": "現在",
  "move.position": "位置 {n}",
  "move.toEnd": "末尾へ移動",
  "move.empty": "この分岐内に他の位置はありません。",
  "arrow.solid": "実線",
  "arrow.dashed": "破線",
  "arrow.none": "なし",
  // branch inspector
  "branch.fork": "並列（フォーク）",
  "branch.if": "分岐（if）",
  "branch.parallelPath": "並列パス",
  "branch.case": "ケース",
  "branch.section": "セクション",
  "branch.subbranch": "サブ分岐",
  "branch.row": "行",
  "branch.condition": "条件",
  "branch.caseLabel": "ケースのラベル",
  "branch.name": "名前",
  "branch.accent": "アクセントカラー",
  "branch.default": "（デフォルト）",
  // color
  "color.presets": "プリセット…",
  // preview
  "preview.fixErrors": "構文エラーを修正するとプレビューが表示されます。",
  "preview.empty": "まだ図がありません。",
  "preview.label": "図のプレビュー",
  // help
  "help.title": "DSL クイックリファレンス",
  "help.markers": "すべての文書はこのマーカーで囲みます。",
  "help.title2": "1行：図のタイトル。",
  "help.page": "description / header-* / footer-* などのメタ情報。",
  "help.option": "図のオプションとガター列の見出し。",
  "help.role": "レーン：<id> の下に label:、background-color:、text-color:、icon:。",
  "help.block": "再利用するステップ形状。[role: text] <blockId> で参照します。",
  "help.prop": "ステップに付ける注釈。props: a,b; で付与します。",
  "help.line":
    "フロー本体。[role: text] のステップ、if / elseif / else / endif、fork / and / endfork、branch / end-branch、section / end-section、merge: id;、[loop]。",
  // template panel
  "tpl.title": "セクションテンプレート",
  "tpl.forced":
    "このセクションはプロジェクトの設定で固定されています。新規図には自動的に適用され、手動挿入はできません。",
  "tpl.noHost": "このホストはセクションテンプレートに対応していません。",
  "tpl.none": "このセクションのテンプレートはありません。",
  "tpl.insert": "挿入",
  "tpl.default": "デフォルト",
  "tpl.loadError": "テンプレートを読み込めませんでした",
  // parts preview popup
  "parts.blockTitle": "ブロックのデザイン",
  "parts.propTitle": "プロップのデザイン",
  "parts.selected": "選択中：{id}",
  "parts.showAll": "すべて表示",
  "parts.showSelected": "選択中のみ表示",
  "parts.none": "デザインがまだ定義されていません。",
  // dialogs
  "dlg.cannotFormat": "整形できません：先に構文エラーを修正してください。",
  "dlg.checkpointMsg": "チェックポイントのメッセージ（任意）",
  "dlg.versionName": "バージョン名",
  "dlg.versionFail": "バージョンを登録できませんでした。",
  "dlg.templateFail": "テンプレートを挿入できませんでした。",
  // flow summaries
  "flow.blankLine": "（空行）",
  "flow.noText": "（テキストなし）",
  "flow.noRole": "（ロールなし）",
  "flow.parallelFork": "並列（フォーク）",
  "flow.condition": "条件",
  "flow.parallelPath": "並列パス",
  "flow.otherwise": "それ以外",
  "flow.case": "ケース",
  "flow.endParallel": "並列の終了",
  "flow.endBranch": "分岐の終了",
  "flow.loopInBranch": "分岐内のループ",
  "flow.mergeTo": "マージ → {id}",
  "flow.unset": "（未設定）",
  "flow.subbranch": "サブ分岐",
  "flow.sectionBox": "セクション枠",
  "flow.endSubbranch": "サブ分岐の終了",
  "flow.endSection": "セクションの終了",
  "flow.stepN": "ステップ {n}",
  // fatal
  "fatal.load": "読み込みに失敗しました：{msg}",
};

const DICTS = { en: EN, ja: JA };

export const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
];

/** Translate `key` against `dict`, falling back to English, then the key. */
export function tr(dict, key, vars) {
  let s = dict?.[key] ?? EN[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
    }
  }
  return s;
}

function detectLang(pref) {
  if (pref && DICTS[pref]) return pref;
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.language === "string" &&
    navigator.language.toLowerCase().startsWith("ja")
  ) {
    return "ja";
  }
  return "en";
}

const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (key, vars) => tr(EN, key, vars),
});

/**
 * Provides the active language + a `t()` translator. `defaultLang` seeds the
 * initial language (else navigator language → English); users can switch via
 * the in-editor language toggle.
 */
export function LanguageProvider({ defaultLang, children }) {
  const [lang, setLang] = useState(() => detectLang(defaultLang));
  const value = useMemo(() => {
    const dict = DICTS[lang] || EN;
    return { lang, setLang, t: (key, vars) => tr(dict, key, vars) };
  }, [lang]);
  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}
