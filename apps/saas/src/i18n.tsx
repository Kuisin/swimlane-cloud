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
  "nav.signOut": "Sign out",
  "nav.role.owner": "Owner",
  "nav.role.editor": "Editor",
  "nav.role.viewer": "Viewer",
  "nav.templates": "Templates",
  "nav.activity": "Activity",
  "nav.edit": "Edit",
  "nav.branches": "Branches",
  "nav.pulls": "Pull Requests",
  "nav.versions": "Versions",
  // landing
  "landing.tagline": "Swimlane Cloud",
  "landing.headline": "Git-backed diagrams for business processes",
  "landing.description":
    "Author swimlane diagrams in a shared editor on top of your own GitHub repositories: save drafts, checkpoint as commits, review pull requests, flag versions and publish — without touching git directly.",
  "landing.openDashboard": "Open dashboard",
  "landing.signIn": "Sign in with GitHub",
  "landing.feature.draft": "Draft & checkpoint",
  "landing.feature.draftDesc":
    "Fast drafts, then one commit per checkpoint on a branch in your repository.",
  "landing.feature.versions": "Flag versions",
  "landing.feature.versionsDesc":
    "Flag a commit on test as a release; every file is snapshotted and tagged.",
  "landing.feature.promote": "Promote to main",
  "landing.feature.promoteDesc": "Promote flagged versions to production with a gated merge.",
  "landing.feature.share": "Public sharing",
  "landing.feature.shareDesc": "Share a stable read-only link for versions on main.",
  // dashboard
  "dashboard.title": "Your projects",
  "dashboard.description":
    'Every GitHub repository you can access that carries the "{topic}" topic. Your role comes from your GitHub permissions on each repository.',
  "dashboard.open": "Open",
  "dashboard.newProject": "New project",
  "dashboard.refresh": "Refresh",
  "dashboard.empty": "No swimlane repositories yet.",
  "dashboard.emptyHint":
    'Create one here, or add the "{topic}" topic to a repository you administer on GitHub.',
  "dashboard.private": "private",
  "dashboard.org": "organisation",
  "dashboard.user": "personal",
  // new project
  "new.title": "New project",
  "new.create": "Create a repository",
  "new.mark": "Mark an existing repository",
  "new.owner": "Owner",
  "new.name": "Repository name",
  "new.createHint":
    "Creates a private repository with main and test branches, a sample diagram, section templates and .swimlane.json, tagged with the swimlane topic. Needs a team or enterprise plan — for an organisation, you must be a team admin there. Free-plan workspaces can mark an existing repository instead.",
  "new.createButton": "Create repository",
  "new.creating": "Creating…",
  "new.markHint":
    "Repositories you administer that are not yet marked. Marking adds the swimlane topic, a test branch and .swimlane.json — nothing else changes.",
  "new.search": "Search repositories…",
  "new.markButton": "Mark",
  "new.noRepos": "No repositories to mark.",
  // login
  "login.title": "Sign in",
  "login.subtitle": "Swimlane Cloud edits diagrams in your own GitHub repositories.",
  "login.github": "Continue with GitHub",
  "login.redirecting": "Redirecting to GitHub…",
  "login.scopeNote":
    'GitHub will ask for the "repo" scope so the app can read and commit diagrams in repositories you already have access to. Nothing is stored except an encrypted copy of that token.',
  "login.error.auth": "Sign-in failed. Please try again.",
  "login.error.github_token":
    "GitHub did not return an access token. Please sign in again and approve the requested access.",
  "login.error.needsAuth": "Your GitHub sign-in has expired — please sign in again.",
  // errors
  "error.needsAuth": "Your GitHub sign-in has expired — sign in again.",
  "error.conflict": "This branch moved on GitHub while you were editing. Reload and try again.",
  "error.rateLimited": "GitHub is rate-limiting requests right now. Try again in a minute.",
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
  "edit.status.viewer": "read-only",
  "edit.readonly": "Read-only: {reason}",
  "edit.lock.main": "main is production and is never edited directly",
  "edit.lock.locked": "this branch has an open pull request",
  "edit.lock.testOwnerOnly": "test can only be edited by a repository admin",
  "edit.lock.viewer": "you have read-only access to this repository",
  "edit.lock.other": "only test and tmp-* branches can be edited here",
  "edit.branchMoved": "This branch moved on GitHub. Reload before checkpointing.",
  "edit.reload": "Reload",
  "edit.startEditBranch": "Start an edit branch",
  "edit.prompt.startEdit": "Name this edit (creates a tmp-* branch from test):",
  "edit.prompt.startEditDefault": "tweak",
  "edit.prompt.checkpoint": "Checkpoint message:",
  "edit.prompt.checkpointDefault": "Update diagram",
  "edit.prompt.prTitle": "Pull request title:",
  "edit.prompt.prTitleDefault": "Merge {branch} into {prBase}",
  "edit.prompt.prOpened":
    "Pull request opened ({branch} → {base}). A repository admin reviews and merges it.",
  "edit.prompt.openPrHint":
    "Pull requests are opened from a tmp-* branch (→ test). test is promoted to main from the Versions tab.",
  "edit.prompt.prAlreadyOpen": "A pull request is already open for this branch",
  // branches page
  "branches.title": "Branches",
  "branches.historyOf": "History · {branch}",
  "branches.confirmUnpublish": "Unpublish this commit (remove its public link)?",
  "branches.confirmPublish": "Publish this commit to a public link?",
  // pulls page
  "pulls.title": "Pull requests",
  "pulls.ownerHint": "You can merge or close pull requests.",
  "pulls.editorHint": "A repository admin merges pull requests.",
  "pulls.confirmMerge": "Merge this pull request{into}?",
  "pulls.confirmMergeInto": " into {base}",
  "pulls.confirmClose": "Close this pull request without merging?",
  // versions page
  "versions.title": "Versions",
  "versions.description": "Flagged from the test branch; promote to main to ship.",
  "versions.testDirty": "test has unsaved drafts — checkpoint them before flagging.",
  "versions.flagNew": "Flag new version",
  "versions.ownerHint": "A repository admin flags versions",
  "versions.confirmPromote": 'Promote "{name}" to main?',
  "versions.renderFailures": "Flagged, but these files could not be parsed: {files}",
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
  "pr.review": "Review & comments",
  "pr.hide": "Hide",
  "pr.openedBy": "opened by {login}",
  "pr.reviewFile": "Review (1 file changed)",
  "pr.reviewFiles": "Review ({n} files changed)",
  "pr.close": "Close",
  "pr.mergeTo": "Merge → {base}",
  "pr.ownerMerges": "An admin merges",
  "pr.commentAs": "Comment as {login}…",
  "pr.comment": "Comment",
  // version panel
  "version.empty": "No versions yet. A repository admin flags one from the test branch above.",
  "version.files": "{n} files",
  "version.promoteTo": "Promote → main",
  "version.ownerPromotes": "An admin promotes",
  "version.onMain": "on main",
  "version.publish": "Publish",
  "version.unpublish": "Unpublish",
  "version.notPublished": "not published",
  "version.includeDsl": "Include DSL source",
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
  // templates settings
  "templates.title": "Section templates",
  "templates.description":
    "Reusable fragments for /page/, /option/, /role/, /block/ and /prop/. Editors insert them from the editor; a forced section must match its template exactly to be saved.",
  "templates.policy": "Policy",
  "templates.mode.optional": "Optional",
  "templates.mode.default": "Default for new files",
  "templates.mode.forced": "Forced",
  "templates.modeHint.optional": "Library only — insert is voluntary.",
  "templates.modeHint.default":
    "New diagrams start from the default template; authors may change it.",
  "templates.modeHint.forced":
    "Every diagram must match the pinned template; drafts and checkpoints that diverge are rejected.",
  "templates.needTemplateToForce": "Create a template for this section before forcing it.",
  "templates.new": "New template",
  "templates.newTitle": "New /{section}/ template",
  "templates.editTitle": "Edit /{section}/ template",
  "templates.edit": "Edit",
  "templates.empty": "No templates for this section yet.",
  "templates.name": "Name",
  "templates.slug": "Slug",
  "templates.slugHint": "derived from the name when empty",
  "templates.body": "Body",
  "templates.isDefault": "Use as the default for new diagrams",
  "templates.forcedBadge": "forced",
  "templates.cannotDeleteForced": "Relax the policy before deleting the forced template.",
  "templates.confirmDelete": 'Delete template "{name}"?',
  // activity
  "activity.title": "Activity",
  "activity.description":
    "Everything done through Swimlane Cloud on this repository, newest first.",
  "activity.empty": "Nothing yet.",
  "activity.action.project.opened": "opened the project",
  "activity.action.checkpoint": "checkpointed",
  "activity.action.edit.started": "started an edit on",
  "activity.action.edit.abandoned": "abandoned the edit",
  "activity.action.pull.opened": "opened pull request",
  "activity.action.pull.merged": "merged pull request",
  "activity.action.pull.closed": "closed pull request",
  "activity.action.version.flagged": "flagged a version",
  "activity.action.version.promoted": "promoted a version to main",
  "activity.action.version.shared": "published a version",
  "activity.action.version.unshared": "unpublished a version",
  "activity.action.template.created": "created a template",
  // billing
  "billing.title": "Plan & billing",
  "billing.description":
    "Limits apply per GitHub owner. Paid plans are not available yet; the limits below are what the app enforces today.",
  "billing.projectsPerOwner": "{n} projects per owner",
  "billing.upgradeSoon": "Upgrade — coming soon",
  // language
  "lang.label": "Language",
};

export const JA: Record<string, string> = {
  // general
  loading: "読み込み中…",
  close: "閉じる",
  // nav
  "nav.dashboard": "← ダッシュボード",
  "nav.signOut": "サインアウト",
  "nav.role.owner": "オーナー",
  "nav.role.editor": "編集者",
  "nav.role.viewer": "閲覧者",
  "nav.templates": "テンプレート",
  "nav.activity": "アクティビティ",
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
  "landing.signIn": "GitHub でサインイン",
  "landing.feature.draft": "草稿とチェックポイント",
  "landing.feature.draftDesc":
    "高速な Postgres 草稿、オンデマンドのグループ化された git コミット。",
  "landing.feature.versions": "バージョンのフラグ",
  "landing.feature.versionsDesc":
    "テストで新しいバージョンをフラグしたときだけ正規の SVG をレンダリング。",
  "landing.feature.promote": "main に昇格",
  "landing.feature.promoteDesc": "ゲートされたマージでフラグ済みバージョンを本番に昇格。",
  "landing.feature.share": "公開共有",
  "landing.feature.shareDesc": "main 上のバージョンの安定した読み取り専用リンクを共有。",
  // dashboard
  "dashboard.title": "プロジェクト",
  "dashboard.description":
    "「{topic}」トピックが付いた、アクセス可能な GitHub リポジトリの一覧です。役割は各リポジトリでの GitHub 権限から決まります。",
  "dashboard.open": "開く",
  "dashboard.newProject": "新規プロジェクト",
  "dashboard.refresh": "更新",
  "dashboard.empty": "swimlane リポジトリはまだありません。",
  "dashboard.emptyHint":
    "ここで作成するか、管理しているリポジトリに GitHub で「{topic}」トピックを追加してください。",
  "dashboard.private": "プライベート",
  "dashboard.org": "組織",
  "dashboard.user": "個人",
  // new project
  "new.title": "新規プロジェクト",
  "new.create": "リポジトリを作成",
  "new.mark": "既存のリポジトリをマーク",
  "new.owner": "オーナー",
  "new.name": "リポジトリ名",
  "new.createHint":
    "main / test ブランチ、サンプル図、セクションテンプレート、.swimlane.json を含むプライベートリポジトリを作成し、swimlane トピックを付けます。チーム / エンタープライズプランが必要です（組織の場合はそのチームの管理者である必要があります）。フリープランのワークスペースは既存のリポジトリをマークしてください。",
  "new.createButton": "リポジトリを作成",
  "new.creating": "作成中…",
  "new.markHint":
    "管理者権限があり、まだマークされていないリポジトリです。マークすると swimlane トピック、test ブランチ、.swimlane.json が追加されます。それ以外は変更しません。",
  "new.search": "リポジトリを検索…",
  "new.markButton": "マーク",
  "new.noRepos": "マークできるリポジトリがありません。",
  // login
  "login.title": "サインイン",
  "login.subtitle": "Swimlane Cloud はあなた自身の GitHub リポジトリ内の図を編集します。",
  "login.github": "GitHub で続行",
  "login.redirecting": "GitHub にリダイレクト中…",
  "login.scopeNote":
    "アクセス権のあるリポジトリの図を読み書きするため、GitHub から「repo」スコープを求められます。保存されるのは暗号化されたトークンのみです。",
  "login.error.auth": "サインインに失敗しました。もう一度お試しください。",
  "login.error.github_token":
    "GitHub からアクセストークンが返されませんでした。もう一度サインインし、要求されたアクセスを承認してください。",
  "login.error.needsAuth": "GitHub のサインインが期限切れです。もう一度サインインしてください。",
  // errors
  "error.needsAuth": "GitHub のサインインが期限切れです。もう一度サインインしてください。",
  "error.conflict":
    "編集中にこのブランチが GitHub 上で更新されました。再読み込みしてやり直してください。",
  "error.rateLimited": "GitHub のレート制限中です。1 分ほど待ってからお試しください。",
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
  "edit.status.viewer": "読み取り専用",
  "edit.readonly": "読み取り専用：{reason}",
  "edit.lock.main": "main は本番のため直接編集できません",
  "edit.lock.locked": "このブランチにはプルリクエストが開かれています",
  "edit.lock.testOwnerOnly": "test はリポジトリ管理者のみ編集できます",
  "edit.lock.viewer": "このリポジトリへのアクセスは読み取り専用です",
  "edit.lock.other": "編集できるのは test と tmp-* ブランチだけです",
  "edit.branchMoved":
    "このブランチは GitHub 上で更新されました。チェックポイントの前に再読み込みしてください。",
  "edit.reload": "再読み込み",
  "edit.startEditBranch": "編集ブランチを開始",
  "edit.prompt.startEdit": "編集名を入力してください（テストから tmp-* ブランチを作成）：",
  "edit.prompt.startEditDefault": "調整",
  "edit.prompt.checkpoint": "チェックポイントのメッセージ：",
  "edit.prompt.checkpointDefault": "図を更新",
  "edit.prompt.prTitle": "プルリクエストのタイトル：",
  "edit.prompt.prTitleDefault": "{branch} を {prBase} にマージ",
  "edit.prompt.prOpened":
    "プルリクエストが開かれました（{branch} → {base}）。リポジトリ管理者がレビューしてマージします。",
  "edit.prompt.openPrHint":
    "プルリクエストは tmp-* ブランチから開きます（→ test）。test はバージョンタブから main に昇格します。",
  "edit.prompt.prAlreadyOpen": "このブランチにはすでにプルリクエストが開かれています",
  // branches page
  "branches.title": "ブランチ",
  "branches.historyOf": "履歴 · {branch}",
  "branches.confirmUnpublish": "このコミットを非公開にしますか（公開リンクを削除します）？",
  "branches.confirmPublish": "このコミットを公開リンクに公開しますか？",
  // pulls page
  "pulls.title": "プルリクエスト",
  "pulls.ownerHint": "プルリクエストのマージまたはクローズができます。",
  "pulls.editorHint": "リポジトリ管理者がプルリクエストをマージします。",
  "pulls.confirmMerge": "このプルリクエストをマージしますか{into}？",
  "pulls.confirmMergeInto": " {base} に",
  "pulls.confirmClose": "このプルリクエストをマージせずにクローズしますか？",
  // versions page
  "versions.title": "バージョン",
  "versions.description":
    "テストブランチからフラグを立て、リリースするには main に昇格してください。",
  "versions.testDirty": "test に未保存の草稿があります。フラグの前にチェックポイントしてください。",
  "versions.flagNew": "新しいバージョンをフラグ",
  "versions.ownerHint": "リポジトリ管理者がバージョンをフラグします",
  "versions.confirmPromote": "「{name}」を main に昇格しますか？",
  "versions.renderFailures": "フラグしましたが、次のファイルは解析できませんでした：{files}",
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
  "pr.review": "レビューとコメント",
  "pr.hide": "閉じる",
  "pr.openedBy": "{login} が作成",
  "pr.reviewFile": "レビュー（1 ファイル変更）",
  "pr.reviewFiles": "レビュー（{n} ファイル変更）",
  "pr.close": "閉じる",
  "pr.mergeTo": "マージ → {base}",
  "pr.ownerMerges": "管理者がマージします",
  "pr.commentAs": "{login} としてコメント…",
  "pr.comment": "コメント",
  // version panel
  "version.empty":
    "バージョンはまだありません。リポジトリ管理者が上のテストブランチからフラグを立てます。",
  "version.files": "{n} ファイル",
  "version.promoteTo": "main に昇格",
  "version.ownerPromotes": "管理者が昇格します",
  "version.onMain": "main に適用済み",
  "version.publish": "公開",
  "version.unpublish": "非公開にする",
  "version.notPublished": "未公開",
  "version.includeDsl": "DSL ソースを含める",
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
  // templates settings
  "templates.title": "セクションテンプレート",
  "templates.description":
    "/page/ /option/ /role/ /block/ /prop/ の再利用可能な断片です。編集者はエディタから挿入できます。強制されたセクションはテンプレートと完全に一致しないと保存できません。",
  "templates.policy": "ポリシー",
  "templates.mode.optional": "任意",
  "templates.mode.default": "新規ファイルの既定",
  "templates.mode.forced": "強制",
  "templates.modeHint.optional": "ライブラリのみ。挿入は任意です。",
  "templates.modeHint.default": "新しい図は既定テンプレートから始まります。変更は自由です。",
  "templates.modeHint.forced":
    "すべての図が固定テンプレートと一致する必要があります。異なる草稿やチェックポイントは拒否されます。",
  "templates.needTemplateToForce": "強制する前に、このセクションのテンプレートを作成してください。",
  "templates.new": "新規テンプレート",
  "templates.newTitle": "新規 /{section}/ テンプレート",
  "templates.editTitle": "/{section}/ テンプレートを編集",
  "templates.edit": "編集",
  "templates.empty": "このセクションのテンプレートはまだありません。",
  "templates.name": "名前",
  "templates.slug": "スラッグ",
  "templates.slugHint": "空の場合は名前から生成",
  "templates.body": "本文",
  "templates.isDefault": "新しい図の既定として使う",
  "templates.forcedBadge": "強制",
  "templates.cannotDeleteForced": "強制テンプレートを削除する前にポリシーを緩めてください。",
  "templates.confirmDelete": "テンプレート「{name}」を削除しますか？",
  // activity
  "activity.title": "アクティビティ",
  "activity.description": "このリポジトリに対して Swimlane Cloud 経由で行われた操作（新しい順）。",
  "activity.empty": "まだ何もありません。",
  "activity.action.project.opened": "プロジェクトを開きました",
  "activity.action.checkpoint": "チェックポイントを作成",
  "activity.action.edit.started": "編集を開始",
  "activity.action.edit.abandoned": "編集を破棄",
  "activity.action.pull.opened": "プルリクエストを作成",
  "activity.action.pull.merged": "プルリクエストをマージ",
  "activity.action.pull.closed": "プルリクエストをクローズ",
  "activity.action.version.flagged": "バージョンをフラグ",
  "activity.action.version.promoted": "バージョンを main に昇格",
  "activity.action.version.shared": "バージョンを公開",
  "activity.action.version.unshared": "バージョンを非公開に",
  "activity.action.template.created": "テンプレートを作成",
  // billing
  "billing.title": "プランと請求",
  "billing.description":
    "制限は GitHub オーナーごとに適用されます。有料プランはまだ提供していません。以下はアプリが現在適用している制限です。",
  "billing.projectsPerOwner": "オーナーあたり {n} プロジェクト",
  "billing.upgradeSoon": "アップグレード — 近日公開",
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
export function tr(
  dict: Record<string, string>,
  key: string,
  vars?: Record<string, string>,
): string {
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

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
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
            lang === l.code ? "bg-indigo-600 text-white" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
