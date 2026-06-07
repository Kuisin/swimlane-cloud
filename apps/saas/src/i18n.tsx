"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Globe } from "lucide-react";

/**
 * Lightweight i18n for the SaaS app shell. Two languages ship — English and
 * Japanese. Components read the active language via `useT()`; the selected
 * language is persisted in localStorage under the key "sw-app-lang".
 */

export const EN: Record<string, string> = {
  // general
  loading: "Loading…",
  close: "Close",
  // nav
  "nav.dashboard": "← Dashboard",
  "nav.resetDemo": "Reset demo",
  "nav.manager": "Manager",
  "nav.member": "Member",
  "nav.edit": "Edit",
  "nav.branches": "Branches",
  "nav.pulls": "Pull Requests",
  "nav.versions": "Versions",
  // landing
  "landing.tagline": "Swimlane Cloud",
  "landing.headline": "Git-backed diagrams for business processes",
  "landing.description":
    "Author swimlane diagrams in a shared editor, save drafts, checkpoint to git, flag versions, and publish — without ever touching git directly.",
  "landing.openDashboard": "Open dashboard",
  "landing.signIn": "Sign in",
  "landing.feature.draft": "Draft & checkpoint",
  "landing.feature.draftDesc": "Fast Postgres drafts, grouped git commits on demand.",
  "landing.feature.versions": "Flag versions",
  "landing.feature.versionsDesc":
    "Render canonical SVG only when you flag a new version on test.",
  "landing.feature.promote": "Promote to main",
  "landing.feature.promoteDesc":
    "Promote flagged versions to production with a gated merge.",
  "landing.feature.share": "Public sharing",
  "landing.feature.shareDesc": "Share a stable read-only link for versions on main.",
  // dashboard
  "dashboard.title": "Dashboard",
  "dashboard.demoMode": "Demo mode",
  "dashboard.description":
    "Open a project to try the full workflow: switch between Manager and Member roles, edit on a tmp-* branch, checkpoint, open a pull request into test (a Manager merges it), then flag a version and promote it to main. Everything is saved in your browser — no account or server needed.",
  "dashboard.open": "Open",
  // login
  "login.title": "Sign in",
  "login.demoHint": "Demo mode — enter anything (or nothing) to continue.",
  "login.emailPlaceholder": "you@company.com",
  "login.passwordPlaceholder": "Password",
  "login.continue": "Continue",
  "login.skip": "Skip sign-in →",
  // edit page
  "edit.startEdit": "Start edit",
  "edit.checkpoint": "Checkpoint",
  "edit.openPrTo": "Open PR → {base}",
  "edit.openPr": "Open PR",
  "edit.editor": "Editor",
  "edit.mobile": "Mobile",
  "edit.unsaved": "unsaved",
  "edit.status.production": "production · read-only",
  "edit.status.locked": "locked · PR open",
  "edit.status.integration": "integration",
  "edit.status.integrationReadonly": "integration · read-only",
  "edit.status.editBranch": "edit branch",
  "edit.readonly": "Read-only: {reason}.",
  "edit.startEditBranch": "Start an edit branch",
  "edit.prompt.startEdit": "Name this edit (creates a tmp-* branch from test):",
  "edit.prompt.startEditDefault": "tweak",
  "edit.prompt.checkpoint": "Checkpoint message:",
  "edit.prompt.checkpointDefault": "Update diagram",
  "edit.prompt.prTitle": "Pull request title:",
  "edit.prompt.prTitleDefault": "Merge {branch} into {prBase}",
  "edit.prompt.prOpened":
    "Pull request opened ({branch} → {base}). A Manager reviews and merges it.",
  "edit.prompt.openPrHint":
    "Open a PR from a tmp-* branch (→ test) or from test (→ main)",
  "edit.prompt.prAlreadyOpen": "A pull request is already open for this branch",
  // branches page
  "branches.title": "Branches",
  "branches.historyOf": "History · {branch}",
  "branches.confirmUnpublish": "Unpublish this commit (remove its public link)?",
  "branches.confirmPublish": "Publish this commit to a public link?",
  // pulls page
  "pulls.title": "Pull requests",
  "pulls.managerHint": "You can merge or close PRs.",
  "pulls.memberHint": "Switch to Manager to merge.",
  "pulls.confirmMerge": "Merge this pull request{into}?",
  "pulls.confirmMergeInto": " into {base}",
  "pulls.confirmClose": "Close this pull request without merging?",
  // versions page
  "versions.title": "Versions",
  "versions.description":
    "Flagged from the test branch; promote to main to ship.",
  "versions.flagNew": "Flag new version",
  "versions.managerHint": "Switch to Manager to flag a version",
  "versions.prompt.name": "Version name (snapshots the current test branch):",
  "versions.prompt.note": "Note (optional):",
  // history panel
  "history.empty": "No commits on this branch.",
  "history.view": "View",
  "history.unpublish": "Unpublish",
  "history.publishHint": "Publish to a public link",
  "history.tip": "tip",
  // commit detail
  "commit.renderError": "Could not render this file (parse error or empty).",
  "commit.noChange": "No change to this file in this commit.",
  "commit.mode.preview": "preview",
  "commit.mode.diff": "diff",
  "commit.mode.text": "text",
  // pr panel
  "pr.empty":
    "No pull requests yet. On the Edit page, open a PR from a tmp-* branch (→ test) or from test (→ main).",
  "pr.hideFiles": "Hide files",
  "pr.reviewFile": "Review (1 file changed)",
  "pr.reviewFiles": "Review ({n} files changed)",
  "pr.close": "Close",
  "pr.mergeTo": "Merge → {base}",
  "pr.managerMerges": "Manager merges",
  "pr.commentAs": "Comment as {role}…",
  "pr.comment": "Comment",
  // version panel
  "version.empty":
    "No versions yet. A Manager flags one from the test branch above.",
  "version.promoteTo": "Promote → main",
  "version.managerPromotes": "Manager promotes",
  "version.onMain": "on main",
  "version.publish": "Publish",
  "version.unpublish": "Unpublish",
  "version.notPublished": "not published",
  // mobile view
  "mobile.addStep": "Add step",
  "mobile.insertStep": "Insert step",
  "mobile.confirmDeleteStep": "Delete this step? This cannot be undone.",
  "mobile.files": "Files",
  "mobile.noFiles": "No files.",
  // arrow styles
  "stepEdit.arrow.solid": "solid",
  "stepEdit.arrow.dashed": "dashed",
  "stepEdit.arrow.dotted": "dotted",
  "stepEdit.arrow.longDash": "long dash",
  "stepEdit.arrow.dashDot": "dash-dot",
  // step edit modal
  "stepEdit.movePosition": "Move position",
  "stepEdit.moveUp": "Move up",
  "stepEdit.moveDown": "Move down",
  "stepEdit.deleteStep": "Delete step",
  "stepEdit.cancel": "Cancel",
  "stepEdit.save": "Save",
  "stepEdit.title": "Edit step",
  "stepEdit.role": "Role (lane)",
  "stepEdit.text": "Text",
  "stepEdit.description": "Description",
  "stepEdit.remark": "Remark",
  "stepEdit.block": "Block style",
  "stepEdit.arrow": "Arrow",
  "stepEdit.props": "Props",
  "stepEdit.chooseRole": "(choose a role)",
  "stepEdit.none": "(none)",
  "stepEdit.selected": "{n} selected",
  // mobile prompt
  "mobilePrompt.title": "Small screen detected",
  "mobilePrompt.body":
    "The full editor is built for wide screens. Switch to a mobile-friendly, read-only view of this diagram?",
  "mobilePrompt.switchMobile": "Switch to mobile view",
  "mobilePrompt.stayEditor": "Stay in the editor",
  // confirm dialogs
  "confirm.resetDemo": "Reset this demo project?",
  // language
  "lang.label": "Language",
};

export const JA: Record<string, string> = {
  // general
  loading: "読み込み中…",
  close: "閉じる",
  // nav
  "nav.dashboard": "← ダッシュボード",
  "nav.resetDemo": "デモをリセット",
  "nav.manager": "マネージャー",
  "nav.member": "メンバー",
  "nav.edit": "編集",
  "nav.branches": "ブランチ",
  "nav.pulls": "プルリクエスト",
  "nav.versions": "バージョン",
  // landing
  "landing.tagline": "スイムレーン クラウド",
  "landing.headline": "ビジネスプロセスのための Git 管理スイムレーン図",
  "landing.description":
    "スイムレーン図を共有エディタで作成し、草稿を保存、git にチェックポイント、バージョンをフラグ、公開 — git を直接操作せずに。",
  "landing.openDashboard": "ダッシュボードを開く",
  "landing.signIn": "サインイン",
  "landing.feature.draft": "草稿とチェックポイント",
  "landing.feature.draftDesc": "高速な Postgres 草稿、オンデマンドのグループ化された git コミット。",
  "landing.feature.versions": "バージョンのフラグ",
  "landing.feature.versionsDesc":
    "テストで新しいバージョンをフラグしたときだけ正規の SVG をレンダリング。",
  "landing.feature.promote": "main に昇格",
  "landing.feature.promoteDesc":
    "ゲートされたマージでフラグ済みバージョンを本番に昇格。",
  "landing.feature.share": "公開共有",
  "landing.feature.shareDesc": "main 上のバージョンの安定した読み取り専用リンクを共有。",
  // dashboard
  "dashboard.title": "ダッシュボード",
  "dashboard.demoMode": "デモモード",
  "dashboard.description":
    "プロジェクトを開いてフルワークフローをお試しください：マネージャーとメンバーを切り替えて、tmp-* ブランチで編集し、チェックポイントを作成し、test へのプルリクエストを開き（マネージャーがマージします）、バージョンをフラグして main に昇格させます。すべてブラウザに保存されます — アカウントもサーバーも不要。",
  "dashboard.open": "開く",
  // login
  "login.title": "サインイン",
  "login.demoHint": "デモモード — 何か入力する（または空のまま）で続行できます。",
  "login.emailPlaceholder": "you@company.com",
  "login.passwordPlaceholder": "パスワード",
  "login.continue": "続行",
  "login.skip": "サインインをスキップ →",
  // edit page
  "edit.startEdit": "編集開始",
  "edit.checkpoint": "チェックポイント",
  "edit.openPrTo": "PR を開く → {base}",
  "edit.openPr": "PR を開く",
  "edit.editor": "エディタ",
  "edit.mobile": "モバイル",
  "edit.unsaved": "未保存",
  "edit.status.production": "本番 · 読み取り専用",
  "edit.status.locked": "ロック · PR 発行中",
  "edit.status.integration": "統合",
  "edit.status.integrationReadonly": "統合 · 読み取り専用",
  "edit.status.editBranch": "編集ブランチ",
  "edit.readonly": "読み取り専用：{reason}。",
  "edit.startEditBranch": "編集ブランチを開始",
  "edit.prompt.startEdit": "編集名を入力してください（テストから tmp-* ブランチを作成）：",
  "edit.prompt.startEditDefault": "調整",
  "edit.prompt.checkpoint": "チェックポイントのメッセージ：",
  "edit.prompt.checkpointDefault": "図を更新",
  "edit.prompt.prTitle": "プルリクエストのタイトル：",
  "edit.prompt.prTitleDefault": "{branch} を {prBase} にマージ",
  "edit.prompt.prOpened":
    "プルリクエストが開かれました（{branch} → {base}）。マネージャーがレビューしてマージします。",
  "edit.prompt.openPrHint": "tmp-* ブランチから PR を開く（→ test）またはテストから（→ main）",
  "edit.prompt.prAlreadyOpen": "このブランチにはすでにプルリクエストが開かれています",
  // branches page
  "branches.title": "ブランチ",
  "branches.historyOf": "履歴 · {branch}",
  "branches.confirmUnpublish": "このコミットを非公開にしますか（公開リンクを削除します）？",
  "branches.confirmPublish": "このコミットを公開リンクに公開しますか？",
  // pulls page
  "pulls.title": "プルリクエスト",
  "pulls.managerHint": "PR のマージまたはクローズができます。",
  "pulls.memberHint": "マージするにはマネージャーに切り替えてください。",
  "pulls.confirmMerge": "このプルリクエストをマージしますか{into}？",
  "pulls.confirmMergeInto": " {base} に",
  "pulls.confirmClose": "このプルリクエストをマージせずにクローズしますか？",
  // versions page
  "versions.title": "バージョン",
  "versions.description": "テストブランチからフラグを立て、リリースするには main に昇格してください。",
  "versions.flagNew": "新しいバージョンをフラグ",
  "versions.managerHint": "バージョンをフラグするにはマネージャーに切り替えてください",
  "versions.prompt.name": "バージョン名（現在のテストブランチのスナップショット）：",
  "versions.prompt.note": "メモ（任意）：",
  // history panel
  "history.empty": "このブランチにコミットはありません。",
  "history.view": "表示",
  "history.unpublish": "非公開にする",
  "history.publishHint": "公開リンクに公開",
  "history.tip": "最新",
  // commit detail
  "commit.renderError": "このファイルを表示できません（パースエラーまたは空です）。",
  "commit.noChange": "このコミットでこのファイルに変更はありません。",
  "commit.mode.preview": "プレビュー",
  "commit.mode.diff": "差分",
  "commit.mode.text": "テキスト",
  // pr panel
  "pr.empty":
    "プルリクエストはまだありません。編集ページで、tmp-* ブランチから PR を開いてください（→ test）またはテストから（→ main）。",
  "pr.hideFiles": "ファイルを非表示",
  "pr.reviewFile": "レビュー（1 ファイル変更）",
  "pr.reviewFiles": "レビュー（{n} ファイル変更）",
  "pr.close": "閉じる",
  "pr.mergeTo": "マージ → {base}",
  "pr.managerMerges": "マネージャーがマージします",
  "pr.commentAs": "{role} としてコメント…",
  "pr.comment": "コメント",
  // version panel
  "version.empty": "バージョンはまだありません。マネージャーが上のテストブランチからフラグを立てます。",
  "version.promoteTo": "main に昇格",
  "version.managerPromotes": "マネージャーが昇格します",
  "version.onMain": "main に適用済み",
  "version.publish": "公開",
  "version.unpublish": "非公開にする",
  "version.notPublished": "未公開",
  // mobile view
  "mobile.addStep": "ステップを追加",
  "mobile.insertStep": "ステップを挿入",
  "mobile.confirmDeleteStep": "このステップを削除しますか？元に戻せません。",
  "mobile.files": "ファイル",
  "mobile.noFiles": "ファイルがありません。",
  // arrow styles
  "stepEdit.arrow.solid": "実線",
  "stepEdit.arrow.dashed": "破線",
  "stepEdit.arrow.dotted": "点線",
  "stepEdit.arrow.longDash": "長破線",
  "stepEdit.arrow.dashDot": "一点鎖線",
  // step edit modal
  "stepEdit.movePosition": "移動",
  "stepEdit.moveUp": "上へ",
  "stepEdit.moveDown": "下へ",
  "stepEdit.deleteStep": "ステップを削除",
  "stepEdit.cancel": "キャンセル",
  "stepEdit.save": "保存",
  "stepEdit.title": "ステップを編集",
  "stepEdit.role": "ロール（レーン）",
  "stepEdit.text": "テキスト",
  "stepEdit.description": "説明",
  "stepEdit.remark": "備考",
  "stepEdit.block": "ブロックスタイル",
  "stepEdit.arrow": "矢印",
  "stepEdit.props": "プロップ",
  "stepEdit.chooseRole": "（ロールを選択）",
  "stepEdit.none": "（なし）",
  "stepEdit.selected": "{n} 選択中",
  // mobile prompt
  "mobilePrompt.title": "小さい画面が検出されました",
  "mobilePrompt.body":
    "フルエディタは広い画面用に設計されています。この図のモバイル対応の読み取り専用ビューに切り替えますか？",
  "mobilePrompt.switchMobile": "モバイルビューに切り替え",
  "mobilePrompt.stayEditor": "エディタに留まる",
  // confirm dialogs
  "confirm.resetDemo": "このデモプロジェクトをリセットしますか？",
  // language
  "lang.label": "言語",
};

const DICTS: Record<string, Record<string, string>> = { en: EN, ja: JA };

export const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "ja", label: "日本語" },
];

const STORAGE_KEY = "sw-app-lang";

/** Translate `key` against `dict`, substituting `{var}` placeholders. */
export function tr(dict: Record<string, string>, key: string, vars?: Record<string, string>): string {
  let s = dict[key] ?? EN[key] ?? key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), vars[k]);
    }
  }
  return s;
}

function detectLang(pref?: string): string {
  if (pref && DICTS[pref]) return pref;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && DICTS[stored]) return stored;
  }
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.language === "string" &&
    navigator.language.toLowerCase().startsWith("ja")
  ) {
    return "ja";
  }
  return "en";
}

type LangContextValue = {
  lang: string;
  setLang: (lang: string) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const LanguageContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key, vars) => tr(EN, key, vars),
});

function initialLang(defaultLang?: string): string {
  return defaultLang && DICTS[defaultLang] ? defaultLang : "en";
}

export function LanguageProvider({
  defaultLang,
  children,
}: {
  defaultLang?: string;
  children: React.ReactNode;
}) {
  // Match SSR and the first client render; sync from storage after hydration.
  const [lang, setLangState] = useState(() => initialLang(defaultLang));

  useEffect(() => {
    setLangState(detectLang(defaultLang));
  }, [defaultLang]);

  function setLang(next: string) {
    setLangState(next);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  const value = useMemo<LangContextValue>(() => {
    const dict = DICTS[lang] || EN;
    return { lang, setLang, t: (key, vars) => tr(dict, key, vars) };
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useT() {
  return useContext(LanguageContext);
}

/** Compact EN / 日本語 switcher. */
export function LanguageToggle() {
  const { lang, setLang, t } = useT();
  return (
    <div
      className="flex items-center gap-0.5 rounded border border-neutral-300 p-0.5"
      role="group"
      aria-label={t("lang.label")}
      title={t("lang.label")}
    >
      <Globe size={13} className="mx-1 text-neutral-400" aria-hidden />
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={`rounded px-1.5 py-0.5 text-xs ${
            lang === l.code
              ? "bg-indigo-600 text-white"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
