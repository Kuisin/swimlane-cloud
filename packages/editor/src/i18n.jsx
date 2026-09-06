import { createContext, useContext, useEffect, useMemo, useState } from "react";

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
  "action.exportTxt": "Export .txt",
  "action.exportSvg": "Export .svg",
  "action.exportPng": "Export .png",
  "action.exportPngHd": "Export .png (high-res)",
  "action.help": "Help",
  "action.version": "Version",
  "action.versionTitle": "Flag new version",
  "action.checkpoint": "Checkpoint",
  "action.saveAll": "Save all",
  "action.save": "Save",
  "action.saveDirty": "Save *",
  "autosave.saving": "Saving…",
  "autosave.saved": "Saved",
  "autosave.error": "Not saved — retrying",
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
  "tree.collapse": "Collapse files",
  "tree.expand": "Expand files",
  "tree.deleteFile": "Delete file",
  "tree.deleteFolder": "Delete folder",
  // file settings
  "file.settings": "Settings",
  "settings.title": "File settings",
  "settings.pageTab": "Page",
  "settings.optionTab": "Options",
  "settings.roleTab": "Roles",
  "settings.blockTab": "Reusable styles",
  "settings.propTab": "Side notes",
  "defs.empty": "None yet.",
  "defs.add": "Add",
  "defs.delete": "Delete",
  "defs.save": "Save",
  "defs.revert": "Revert",
  "defs.field.label": "Label",
  "defs.field.bg": "Background",
  "defs.field.textColor": "Text color",
  "defs.field.borderColor": "Border color",
  "defs.field.icon": "Icon",
  "defs.field.shape": "Shape",
  "defs.field.side": "Side",
  "defs.field.title": "Title",
  "defs.field.maxChars": "Max chars",
  "defs.pick.icon": "Pick an icon",
  "defs.pick.color": "Pick a color",
  "defs.pick.search": "Search icons…",
  "defs.pick.clear": "Clear",
  "defs.pick.custom": "Custom",
  "defs.pick.none": "No matches",
  "settings.pageTitle": "Title",
  "settings.description": "Description",
  "settings.headerLeft": "Header left",
  "settings.headerCenter": "Header center",
  "settings.headerRight": "Header right",
  "settings.footerLeft": "Footer left",
  "settings.footerCenter": "Footer center",
  "settings.footerRight": "Footer right",
  "settings.showLeftGutter": "Show left gutter",
  "settings.showRightGutter": "Show right gutter",
  "settings.showHeader": "Show header",
  "settings.showFooter": "Show footer",
  "settings.showDescription": "Show description",
  "settings.showCaptions": "Show step captions",
  "settings.mergeAtPrev": "Merge at previous block",
  "settings.branchColorArrows": "Branch color arrows",
  "settings.leftTitle": "Left gutter title",
  "settings.leftSubtitle": "Left gutter subtitle",
  "settings.rightTitle": "Right gutter title",
  "settings.rightSubtitle": "Right gutter subtitle",
  // errors
  "errors.title": "Parse errors",
  // gui
  "gui.flow": "Flow",
  "gui.addStep": "Add step",
  "gui.addBlock": "Add block",
  "gui.addIf": "If branch",
  "gui.addFork": "Parallel fork",
  "gui.addSection": "Group visually (no flow change)",
  "gui.addBranch": "Side path that rejoins later",
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
  "step.role": "Who does this (role)",
  "step.chooseRole": "(choose who does this)",
  "step.text": "Text",
  "step.label": "Label (optional)",
  "step.description": "Description",
  "step.remark": "Remark",
  "step.block": "Look/style (optional)",
  "step.none": "(none)",
  "step.arrow": "Arrow",
  "step.mergeId": "Landing point name (optional) — lets a branch jump here",
  "step.props": "Side notes (optional)",
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
  "arrow.dotted": "dotted",
  "arrow.longDash": "long dash",
  "arrow.dashDot": "dash-dot",
  // branch inspector
  "branch.fork": "Parallel (fork)",
  "branch.if": "Branch (if)",
  "branch.parallelPath": "Parallel path",
  "branch.case": "Case",
  "branch.section": "Visual group (no flow change)",
  "branch.subbranch": "Side path (rejoins later)",
  "branch.row": "Row",
  "branch.condition": "Condition",
  "branch.caseLabel": "Case label",
  "branch.elsePlaceholder": 'Type "else" for catch-all',
  "branch.addCase": "Add case",
  "branch.addPath": "Add path",
  "branch.name": "Name",
  "branch.accent": "Highlight color",
  "branch.default": "(default)",
  // gui – add block dropdown
  "gui.addSwitch": "Switch / multi-case",
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
  "help.icon": "#name for a Lucide icon (e.g. #check, #zap), or any plain character/emoji.",
  "help.comment":
    "Lines starting with // or *** are comments. Inside /line/ they're kept attached to the next line on format.",
  "help.loop": "End a case with [loop] to route back to the same if's condition instead of endif.",
  "help.section":
    "Wraps steps in a dashed box for visual grouping only — the main flow is unchanged.",
  "help.branch":
    "Splits off a side path from the main flow; only the last step merges back, into whatever follows end-branch.",
  "help.merge":
    "Ends a case by jumping forward to a downstream step's id: instead of the endif diamond.",
  "help.arrow":
    "Sets the line style (solid / dashed / dotted) of the connector right after this step.",
  "help.templatesTitle": "Reusable role / block / prop snippets",
  "help.templatesHint":
    "Starter IDs and properties to copy into /role/, /block/, /prop/. Project-backed catalogs (with previews) are available from the Templates toolbar button when the host supports them.",
  "help.tplRoleTitle": "Common lanes",
  "help.tplBlockTitle": "Common step styles",
  "help.tplPropTitle": "Common side chips",
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
  "dlg.pngFailed": "Could not export PNG from this diagram.",
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
  "action.exportTxt": ".txt で書き出し",
  "action.exportSvg": ".svg で書き出し",
  "action.exportPng": ".png で書き出し",
  "action.exportPngHd": ".png（高解像度）で書き出し",
  "action.help": "ヘルプ",
  "action.version": "バージョン",
  "action.versionTitle": "新しいバージョンを登録",
  "action.checkpoint": "チェックポイント",
  "action.saveAll": "すべて保存",
  "action.save": "保存",
  "action.saveDirty": "保存 *",
  "autosave.saving": "保存中…",
  "autosave.saved": "保存済み",
  "autosave.error": "保存できません（再試行中）",
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
  "tree.collapse": "ツリーを折りたたむ",
  "tree.expand": "ツリーを展開",
  "tree.deleteFile": "ファイルを削除",
  "tree.deleteFolder": "フォルダを削除",
  // file settings
  "file.settings": "設定",
  "settings.title": "ファイル設定",
  "settings.pageTab": "ページ",
  "settings.optionTab": "オプション",
  "settings.roleTab": "ロール",
  "settings.blockTab": "共通スタイル",
  "settings.propTab": "補足チップ",
  "defs.empty": "まだありません。",
  "defs.add": "追加",
  "defs.delete": "削除",
  "defs.save": "保存",
  "defs.revert": "元に戻す",
  "defs.field.label": "ラベル",
  "defs.field.bg": "背景色",
  "defs.field.textColor": "文字色",
  "defs.field.borderColor": "枠線色",
  "defs.field.icon": "アイコン",
  "defs.field.shape": "形状",
  "defs.field.side": "サイド",
  "defs.field.title": "タイトル",
  "defs.field.maxChars": "最大文字数",
  "defs.pick.icon": "アイコンを選択",
  "defs.pick.color": "色を選択",
  "defs.pick.search": "アイコンを検索…",
  "defs.pick.clear": "クリア",
  "defs.pick.custom": "カスタム",
  "defs.pick.none": "該当なし",
  "settings.pageTitle": "タイトル",
  "settings.description": "説明",
  "settings.headerLeft": "ヘッダー左",
  "settings.headerCenter": "ヘッダー中央",
  "settings.headerRight": "ヘッダー右",
  "settings.footerLeft": "フッター左",
  "settings.footerCenter": "フッター中央",
  "settings.footerRight": "フッター右",
  "settings.showLeftGutter": "左ガターを表示",
  "settings.showRightGutter": "右ガターを表示",
  "settings.showHeader": "ヘッダーを表示",
  "settings.showFooter": "フッターを表示",
  "settings.showDescription": "説明を表示",
  "settings.showCaptions": "ステップキャプションを表示",
  "settings.mergeAtPrev": "前のブロックでマージ",
  "settings.branchColorArrows": "分岐カラー矢印",
  "settings.leftTitle": "左ガタータイトル",
  "settings.leftSubtitle": "左ガターサブタイトル",
  "settings.rightTitle": "右ガタータイトル",
  "settings.rightSubtitle": "右ガターサブタイトル",
  // errors
  "errors.title": "構文エラー",
  // gui
  "gui.flow": "フロー",
  "gui.addStep": "ステップを追加",
  "gui.addBlock": "ブロックを追加",
  "gui.addIf": "条件分岐（if）",
  "gui.addFork": "並行処理（fork）",
  "gui.addSection": "見た目のグループ枠（流れは変わらない）",
  "gui.addBranch": "本流から外れて後で合流する支線",
  "gui.addSwitch": "スイッチ／多分岐",
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
  "step.role": "誰が行うか（担当）",
  "step.chooseRole": "（担当を選択）",
  "step.text": "テキスト",
  "step.label": "ラベル（任意）",
  "step.description": "説明",
  "step.remark": "備考",
  "step.block": "見た目のスタイル（任意）",
  "step.none": "（なし）",
  "step.arrow": "矢印",
  "step.mergeId": "合流先の名前（任意）— 分岐からここへジャンプできます",
  "step.props": "補足チップ（任意）",
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
  "arrow.dotted": "点線",
  "arrow.longDash": "長破線",
  "arrow.dashDot": "一点鎖線",
  // branch inspector
  "branch.fork": "並列（フォーク）",
  "branch.if": "分岐（if）",
  "branch.parallelPath": "並列パス",
  "branch.case": "ケース",
  "branch.section": "見た目のグループ（流れは変わらない）",
  "branch.subbranch": "横道（後で合流する支線）",
  "branch.row": "行",
  "branch.condition": "条件",
  "branch.caseLabel": "ケースのラベル",
  "branch.elsePlaceholder": "「else」と入力するとデフォルトケースになります",
  "branch.addCase": "ケースを追加",
  "branch.addPath": "パスを追加",
  "branch.name": "名前",
  "branch.accent": "強調色",
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
  "help.icon":
    "#名前 で Lucide アイコンを指定（例：#check、#zap）。# 無しは文字・絵文字としてそのまま表示。",
  "help.comment":
    "// または *** で始まる行はコメントです。/line/ 内では整形しても直後の行に付いたまま保持されます。",
  "help.loop": "ケースの末尾に [loop] を置くと、endif ではなく同じ if の条件へ戻る矢印になります。",
  "help.section": "本流の流れは変えず、関連ステップを点線ボックスで視覚的に囲うだけの枠です。",
  "help.branch":
    "本流から分岐する支線です。末尾のステップだけが end-branch 直後のブロックへ合流します。",
  "help.merge":
    "ケースの末尾で endif の合流ダイヤモンドを使わず、下流の id: へ直接前方合流します。",
  "help.arrow": "このステップの直後に描く矢印の線種（実線／破線／点線）を指定します。",
  "help.templatesTitle": "再利用できる role / block / prop の例",
  "help.templatesHint":
    "/role/・/block/・/prop/ にそのまま貼り付けられる ID とプロパティの例です。プロジェクト管理のテンプレートカタログ（プレビュー付き）は、ホストが対応していればツールバーの「テンプレート」から利用できます。",
  "help.tplRoleTitle": "よく使うレーン",
  "help.tplBlockTitle": "よく使うステップの見た目",
  "help.tplPropTitle": "よく使う側面チップ",
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
  "dlg.pngFailed": "この図のPNG書き出しに失敗しました。",
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
  // Follow a controlled language (e.g. the host app's toggle) when it changes.
  useEffect(() => {
    if (defaultLang && DICTS[defaultLang]) setLang(defaultLang);
  }, [defaultLang]);
  const value = useMemo(() => {
    const dict = DICTS[lang] || EN;
    return { lang, setLang, t: (key, vars) => tr(dict, key, vars) };
  }, [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
