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
  "common.cancel": "Cancel",
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
  "landing.headline": "Business process diagrams, versioned like code",
  "landing.description":
    "Draw swimlane diagrams in a GUI, or write them as plain text — whichever suits the person editing. Every diagram is a .txt file in your own GitHub repository, so history, review and releases are ordinary git, and nothing is locked inside another vendor's database.",
  "landing.ctaPrimary": "Continue with GitHub",
  "landing.ctaSecondary": "How it works",
  "landing.openDashboard": "Open dashboard",
  "landing.signIn": "Sign in with GitHub",
  "landing.heroNote":
    "Free to start. Your diagrams stay in repositories you already own — we never create a copy elsewhere.",

  // what it is
  "landing.what.title": "Two editors, one file",
  "landing.what.lead":
    "A swimlane diagram here is a small text format (the kai-swimlane DSL). Because it is text, two very different people can edit the same document without stepping on each other.",
  "landing.what.gui": "GUI mode",
  "landing.what.guiDesc":
    "A form-based editor: add steps, pick the lane that owns each one, attach conditions, branches and notes. No syntax to learn — the person who owns the process can edit it themselves.",
  "landing.what.text": "Text mode",
  "landing.what.textDesc":
    "The same document as source, with syntax highlighting, line numbers and parse errors marked inline. Fast for people who would rather type than click, and reviewable as a diff.",
  "landing.what.preview": "Live preview",
  "landing.what.previewDesc":
    "The diagram redraws as you type, rendered on your own device. Switching between GUI and text is loss-free — both write the same canonical file.",

  // workflow
  "landing.flow.title": "How a change reaches production",
  "landing.flow.lead":
    "The workflow mirrors how software ships, with the git vocabulary kept out of the way. Three branches: main is published, preview is where work is approved, and each edit gets its own short-lived branch.",
  "landing.flow.branches": "Edit branches merge into preview; only released versions reach main.",
  "landing.flow.s1": "Connect a repository",
  "landing.flow.s1Desc":
    "Add the swimlane topic to a repository you already have, or let the app create one — seeded with a sample diagram, section templates and a .swimlane.json that says where diagrams live.",
  "landing.flow.s2": "Edit",
  "landing.flow.s2Desc":
    "Start an edit and the app cuts a new branch from preview for you. Save as often as you like: drafts are stored instantly and never clutter git history.",
  "landing.flow.s3": "Checkpoint",
  "landing.flow.s3Desc":
    "When a piece of work is done, one checkpoint turns every changed file into a single commit — created, edited and deleted files together, authored as you on GitHub.",
  "landing.flow.s4": "Review",
  "landing.flow.s4Desc":
    "Open a pull request into preview. Reviewers see a real diff plus a side-by-side render of before and after, and the conversation is a normal GitHub thread.",
  "landing.flow.s5": "Release",
  "landing.flow.s5Desc":
    "Flag a commit on preview as a version: every diagram is snapshotted and the commit is tagged. Promoting merges exactly that commit into main — only flagged versions can reach production.",
  "landing.flow.s6": "Share",
  "landing.flow.s6Desc":
    "Publish a promoted version to a stable read-only link for people outside the repository. Choose whether the DSL source is visible or only the rendered diagram.",

  // features
  "landing.features.title": "What you get",
  "landing.features.editor": "A real editor, not a viewer",
  "landing.features.editorDesc":
    "Folder tree over your whole diagram directory, tabs, keyboard shortcuts, formatting, and create / rename / delete — the same editor the desktop and VS Code builds use.",
  "landing.features.templates": "Section templates, optionally enforced",
  "landing.features.templatesDesc":
    "Keep headers, lane styles and reusable blocks consistent across a team. An owner can force a section to match its template, and a checkpoint that diverges is rejected with a clear reason.",
  "landing.features.git": "Your git, not ours",
  "landing.features.gitDesc":
    "Commits, branches, tags, pull requests and releases are created in your repository under your own account, so they show up in the tools and audits you already have.",
  "landing.features.roles": "Permissions you already manage",
  "landing.features.rolesDesc":
    "Access comes from GitHub: repository admins are owners, people with push access can edit, everyone else is read-only. There is no second list of users to keep in sync.",
  "landing.features.versions": "Versions that mean something",
  "landing.features.versionsDesc":
    "A version is a named snapshot of the whole folder at one commit, not an autosave. Production only ever receives commits that were explicitly flagged.",
  "landing.features.mobile": "Readable on a phone",
  "landing.features.mobileDesc":
    "A wide diagram is unusable on a small screen, so the same document also renders as a vertical card view — and steps can be edited from there.",
  "landing.features.export": "Export anywhere",
  "landing.features.exportDesc":
    "Download a diagram as .txt, SVG, or PNG at normal or high resolution for slides, wikis and printed procedures.",
  "landing.features.i18n": "English and Japanese",
  "landing.features.i18nDesc":
    "The whole interface ships in both languages, switchable at any time — including the editor itself.",

  // trust
  "landing.trust.title": "Where your data actually is",
  "landing.trust.source": "GitHub is the source of truth",
  "landing.trust.sourceDesc":
    "Diagrams are plain .txt files committed to your repository. If you stop using this app tomorrow, the work stays exactly where it is and remains readable.",
  "landing.trust.token": "Your GitHub token is encrypted at rest",
  "landing.trust.tokenDesc":
    "Sign-in is GitHub OAuth. The access token is encrypted with AES-256-GCM before it is stored, and every action runs as you — there is no shared bot account.",
  "landing.trust.db": "Only what git cannot hold",
  "landing.trust.dbDesc":
    "The database keeps unsaved drafts, version snapshots and templates. It is reachable only through the API, after your GitHub permissions have been checked.",
  "landing.trust.region": "Hosted in Japan",
  "landing.trust.regionDesc":
    "The application and its database both run in Tokyo (Vercel hnd1, Supabase ap-northeast-1).",

  // plans
  "landing.plans.title": "Plans",
  "landing.plans.lead":
    "Limits apply per GitHub owner — your account, or each organisation. Paid plans are not on sale yet; today every workspace runs on the free tier.",
  "landing.plans.free": "Free",
  "landing.plans.freePrice": "$0",
  "landing.plans.freeFor": "Trying it out, or a small set of diagrams",
  "landing.plans.freeF1": "3 projects per owner",
  "landing.plans.freeF2": "Full editor, review and versions",
  "landing.plans.freeF3": "Use repositories you already have",
  "landing.plans.team": "Team",
  "landing.plans.teamPrice": "Coming soon",
  "landing.plans.teamFor": "Teams running processes across several repositories",
  "landing.plans.teamF1": "50 projects per owner",
  "landing.plans.teamF2": "Create new repositories from the app",
  "landing.plans.teamF3": "Everything in Free",
  "landing.plans.enterprise": "Enterprise",
  "landing.plans.enterprisePrice": "Talk to us",
  "landing.plans.enterpriseFor": "Organisations with their own hosting or audit needs",
  "landing.plans.enterpriseF1": "Unlimited projects",
  "landing.plans.enterpriseF2": "GitHub Enterprise Server",
  "landing.plans.enterpriseF3": "Everything in Team",

  // faq
  "landing.faq.title": "Questions",
  "landing.faq.q1": "Do I need to know git?",
  "landing.faq.a1":
    "No. The app speaks in Save, Checkpoint, Review and Release. It creates the branches, commits and pull requests underneath, so someone who has never used git can still produce a clean, reviewable history.",
  "landing.faq.q2": "What happens to my diagrams if I stop using this?",
  "landing.faq.a2":
    "Nothing. They are .txt files in your repository, already committed. The renderer is open source, and the desktop app and VS Code extension read the same files with no server at all.",
  "landing.faq.q3": "Which repositories does it touch?",
  "landing.faq.a3":
    "Only ones carrying the swimlane topic, and only ones your GitHub account can already reach. Repositories without the topic are never listed and never modified.",
  "landing.faq.q4": "Can people outside my repository see a diagram?",
  "landing.faq.a4":
    "Only if an owner publishes a released version, and only that version. The link is a random slug, and you choose whether it exposes the source or just the rendered diagram.",
  "landing.faq.q5": "Why does it ask for the repo scope?",
  "landing.faq.a5":
    "GitHub has no narrower scope that can read and commit to a private repository. The token is stored encrypted and used only for the repositories you open here.",
  "landing.faq.q6": "Does it work offline?",
  "landing.faq.a6":
    "The preview always renders on your own device, so drawing never needs the network. Saving and history do — for fully offline work there is a desktop build that edits a local folder.",

  // closing
  "landing.closing.title": "Start with a repository you already have",
  "landing.closing.lead":
    "Sign in with GitHub, add the swimlane topic to a repository, and open it. Nothing is created until you ask for it.",
  "landing.footer.source": "Source on GitHub",
  "landing.footer.rights": "Diagrams stay in your repositories.",

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
    "Creates a private repository with main and preview branches, a sample diagram, section templates and .swimlane.json, tagged with the swimlane topic. Needs a team or enterprise plan — for an organisation, you must be a team admin there. Free-plan workspaces can mark an existing repository instead.",
  "new.createButton": "Create repository",
  "new.creating": "Creating…",
  "new.markHint":
    "Repositories you administer that are not yet marked. Marking adds the swimlane topic, a preview branch and .swimlane.json — nothing else changes.",
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
  "edit.editor": "Editor",
  "edit.mobile": "Mobile",
  "edit.unsaved": "unsaved",
  "edit.myEdit": "My edit",
  "edit.startEditing": "Start editing",
  "edit.backToEdit": "Back to my edit",
  "edit.push": "Push to GitHub",
  "edit.push.title": "Save your changes to GitHub",
  "edit.push.message": "Message (optional)",
  "edit.push.files": "Changed files",
  "edit.push.nothing": "Nothing to push.",
  "edit.requestReview": "Request review",
  "edit.review.title": "Request a review",
  "edit.review.unpushed": "Some changes are not on GitHub yet. Push them first.",
  "edit.review.pushFirst": "Push first",
  "edit.review.noChanges": "No differences from Approved.",
  "edit.review.titleField": "Title (optional)",
  "edit.review.titleDefault": "Update {n} diagrams",
  "edit.review.requested": "Review requested (#{n}). An admin will approve it.",
  "edit.underReview": "Under review #{n}",
  "edit.discard": "Discard edit",
  "edit.discard.confirm": "Discard this edit and all its changes? This cannot be undone.",
  "edit.status.editing": "Editing",
  "edit.status.underReview": "Under review",
  "edit.status.viewer": "read-only",
  "edit.readonly": "Read-only: {reason}",
  "edit.lock.main": "main is published and is never edited directly",
  "edit.lock.locked": "this branch has an open pull request",
  "edit.lock.previewOwnerOnly": "preview can only be edited by a repository admin",
  "edit.lock.viewer": "you have read-only access to this repository",
  "edit.lock.other": "only preview and edit branches can be edited here",
  "edit.branchMoved": "This branch moved on GitHub. Reload before pushing.",
  "edit.reload": "Reload",
  // branches page
  "branches.title": "Branches",
  "branches.historyOf": "History · {branch}",
  "branches.confirmUnpublish": "Unpublish this commit (remove its public link)?",
  "branches.confirmPublish": "Publish this commit to a public link?",
  // pulls page
  "pulls.title": "Pull requests",
  "pulls.ownerHint": "You can approve or reject requests.",
  "pulls.editorHint": "An admin approves requests.",
  "pulls.approve.title": "Approve and apply to {base}",
  "pulls.approve.hint": "These files will become the approved version.",
  "pulls.reject.confirm": "Reject this request without applying it?",
  // versions page
  "versions.title": "Versions",
  "versions.description": "Flagged from the preview branch; promote to main to ship.",
  "versions.previewDirty": "preview has unsaved drafts — checkpoint them before flagging.",
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
    "No pull requests yet. On the Edit page, open a PR from an edit branch (→ preview) or from preview (→ main).",
  "pr.review": "Review & comments",
  "pr.hide": "Hide",
  "pr.openedBy": "opened by {login}",
  "pr.reviewFile": "Review (1 file changed)",
  "pr.reviewFiles": "Review ({n} files changed)",
  "pr.reject": "Reject",
  "pr.approve": "Approve → {base}",
  "pr.ownerMerges": "An admin approves",
  "pr.commentAs": "Comment as {login}…",
  "pr.comment": "Comment",
  // version panel
  "version.empty": "No versions yet. A repository admin flags one from the preview branch above.",
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
  // branch labels
  "branch.preview": "Approved",
  "branch.main": "Published",
  "branch.edit": "{user}'s edit",
  // change lists
  "changes.empty": "No changes.",
  "changes.status.added": "added",
  "changes.status.changed": "changed",
  "changes.status.removed": "removed",
};

export const JA: Record<string, string> = {
  // general
  loading: "読み込み中…",
  close: "閉じる",
  "common.cancel": "キャンセル",
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
  "landing.headline": "業務フロー図を、コードと同じようにバージョン管理する",
  "landing.description":
    "スイムレーン図を GUI で描くことも、プレーンテキストとして書くこともできます。編集する人に合う方を選んでください。すべての図はあなた自身の GitHub リポジトリ内の .txt ファイルなので、履歴・レビュー・リリースは通常の git のまま。他社のデータベースに閉じ込められることはありません。",
  "landing.ctaPrimary": "GitHub で続行",
  "landing.ctaSecondary": "仕組みを見る",
  "landing.openDashboard": "ダッシュボードを開く",
  "landing.signIn": "GitHub でサインイン",
  "landing.heroNote":
    "無料で始められます。図はあなたが既に所有しているリポジトリに残り、別の場所に複製されることはありません。",

  // what it is
  "landing.what.title": "2 つのエディタ、1 つのファイル",
  "landing.what.lead":
    "ここでのスイムレーン図は小さなテキスト形式（kai-swimlane DSL）です。テキストだからこそ、まったく異なる立場の人が同じドキュメントを衝突せずに編集できます。",
  "landing.what.gui": "GUI モード",
  "landing.what.guiDesc":
    "フォーム形式のエディタです。ステップを追加し、担当レーンを選び、条件・分岐・備考を付けるだけ。覚える構文はありません。業務のオーナー自身が編集できます。",
  "landing.what.text": "テキストモード",
  "landing.what.textDesc":
    "同じドキュメントをソースとして表示します。シンタックスハイライト、行番号、パースエラーの行内表示付き。入力の速い人に向いており、差分としてレビューできます。",
  "landing.what.preview": "ライブプレビュー",
  "landing.what.previewDesc":
    "入力に合わせて手元の端末で図が再描画されます。GUI とテキストの切り替えは無損失で、どちらも同じ正規のファイルを書き込みます。",

  // workflow
  "landing.flow.title": "変更が本番に届くまで",
  "landing.flow.lead":
    "ソフトウェアのリリースと同じ流れを、git の用語を表に出さずに実現します。ブランチは 3 種類。main は公開済み、preview は承認済み、そして各編集には専用の短命ブランチが割り当てられます。",
  "landing.flow.branches":
    "編集ブランチは preview にマージされ、main に届くのはリリース済みバージョンだけです。",
  "landing.flow.s1": "リポジトリを接続",
  "landing.flow.s1Desc":
    "既存のリポジトリに swimlane トピックを付けるか、アプリに作成させます。サンプル図・セクションテンプレート・図の場所を示す .swimlane.json が用意されます。",
  "landing.flow.s2": "編集",
  "landing.flow.s2Desc":
    "編集を開始すると preview から新しいブランチが自動で作られます。保存は何度でも。草稿は即座に保存され、git の履歴を汚しません。",
  "landing.flow.s3": "チェックポイント",
  "landing.flow.s3Desc":
    "作業の区切りで 1 回チェックポイントすると、変更されたすべてのファイルが 1 つのコミットになります。作成・編集・削除がまとめて、あなた名義で GitHub に記録されます。",
  "landing.flow.s4": "レビュー",
  "landing.flow.s4Desc":
    "preview へプルリクエストを開きます。レビュアーは実際の差分に加えて、変更前後を並べたレンダリングを確認でき、議論は通常の GitHub スレッドで行われます。",
  "landing.flow.s5": "リリース",
  "landing.flow.s5Desc":
    "preview 上のコミットをバージョンとしてフラグすると、全図がスナップショットされ、コミットにタグが付きます。昇格ではそのコミットだけが main にマージされ、フラグ済みのバージョンだけが本番に到達します。",
  "landing.flow.s6": "共有",
  "landing.flow.s6Desc":
    "昇格済みのバージョンを、リポジトリ外の人向けに読み取り専用の固定リンクとして公開できます。DSL ソースを見せるか、描画された図だけにするかを選べます。",

  // features
  "landing.features.title": "できること",
  "landing.features.editor": "ビューアではなく、本物のエディタ",
  "landing.features.editorDesc":
    "図のディレクトリ全体を扱うフォルダツリー、タブ、キーボードショートカット、整形、作成・リネーム・削除。デスクトップ版や VS Code 版と同じエディタです。",
  "landing.features.templates": "セクションテンプレート（強制も可能）",
  "landing.features.templatesDesc":
    "ヘッダー、レーンのスタイル、再利用ブロックをチーム全体で統一できます。オーナーはセクションをテンプレートと一致させるよう強制でき、逸脱したチェックポイントは理由付きで拒否されます。",
  "landing.features.git": "私たちの git ではなく、あなたの git",
  "landing.features.gitDesc":
    "コミット、ブランチ、タグ、プルリクエスト、リリースは、あなたのアカウントのリポジトリに作成されます。既存のツールや監査にそのまま現れます。",
  "landing.features.roles": "すでに管理している権限をそのまま",
  "landing.features.rolesDesc":
    "アクセス権は GitHub 由来です。リポジトリ管理者はオーナー、push 権限がある人は編集者、それ以外は読み取り専用。同期すべきユーザー一覧が二重に存在しません。",
  "landing.features.versions": "意味のあるバージョン",
  "landing.features.versionsDesc":
    "バージョンは自動保存ではなく、1 つのコミット時点のフォルダ全体に名前を付けたスナップショットです。本番には明示的にフラグされたコミットしか届きません。",
  "landing.features.mobile": "スマートフォンでも読める",
  "landing.features.mobileDesc":
    "横長の図は小さな画面では読めないため、同じドキュメントを縦方向のカード表示でも描画します。そこからステップを編集することもできます。",
  "landing.features.export": "どこへでも書き出し",
  "landing.features.exportDesc":
    "資料・社内 Wiki・印刷手順書向けに、.txt / SVG / PNG（通常・高解像度）で書き出せます。",
  "landing.features.i18n": "日本語と英語",
  "landing.features.i18nDesc":
    "エディタを含むすべての画面が両言語に対応し、いつでも切り替えられます。",

  // trust
  "landing.trust.title": "データが実際に置かれる場所",
  "landing.trust.source": "正となるのは GitHub",
  "landing.trust.sourceDesc":
    "図はリポジトリにコミットされたプレーンな .txt ファイルです。明日このアプリの利用をやめても、成果物はそのまま残り、読める状態が続きます。",
  "landing.trust.token": "GitHub トークンは暗号化して保管",
  "landing.trust.tokenDesc":
    "サインインは GitHub OAuth です。アクセストークンは AES-256-GCM で暗号化してから保存され、すべての操作はあなた名義で実行されます。共有のボットアカウントはありません。",
  "landing.trust.db": "git に保持できないものだけ",
  "landing.trust.dbDesc":
    "データベースが持つのは未保存の草稿、バージョンのスナップショット、テンプレートだけです。GitHub の権限を確認したうえで、API 経由でのみ到達できます。",
  "landing.trust.region": "日本国内でホスティング",
  "landing.trust.regionDesc":
    "アプリケーションとデータベースはどちらも東京で稼働しています（Vercel hnd1 / Supabase ap-northeast-1）。",

  // plans
  "landing.plans.title": "プラン",
  "landing.plans.lead":
    "制限は GitHub オーナー単位（個人アカウント、または組織ごと）で適用されます。有料プランはまだ販売しておらず、現在はすべてのワークスペースが無料プランで動作しています。",
  "landing.plans.free": "Free",
  "landing.plans.freePrice": "¥0",
  "landing.plans.freeFor": "試用、または少数の図の管理に",
  "landing.plans.freeF1": "オーナーあたり 3 プロジェクト",
  "landing.plans.freeF2": "エディタ・レビュー・バージョンのすべて",
  "landing.plans.freeF3": "既存のリポジトリをそのまま利用",
  "landing.plans.team": "Team",
  "landing.plans.teamPrice": "近日提供",
  "landing.plans.teamFor": "複数リポジトリで業務を運用するチームに",
  "landing.plans.teamF1": "オーナーあたり 50 プロジェクト",
  "landing.plans.teamF2": "アプリから新規リポジトリを作成",
  "landing.plans.teamF3": "Free のすべての機能",
  "landing.plans.enterprise": "Enterprise",
  "landing.plans.enterprisePrice": "お問い合わせ",
  "landing.plans.enterpriseFor": "独自のホスティングや監査要件がある組織に",
  "landing.plans.enterpriseF1": "プロジェクト数無制限",
  "landing.plans.enterpriseF2": "GitHub Enterprise Server",
  "landing.plans.enterpriseF3": "Team のすべての機能",

  // faq
  "landing.faq.title": "よくある質問",
  "landing.faq.q1": "git の知識は必要ですか？",
  "landing.faq.a1":
    "不要です。アプリ上の言葉は「保存」「チェックポイント」「レビュー」「リリース」だけです。ブランチ・コミット・プルリクエストは裏側で作成されるため、git を使ったことがない人でも、きれいでレビュー可能な履歴を残せます。",
  "landing.faq.q2": "利用をやめたら図はどうなりますか？",
  "landing.faq.a2":
    "何も起きません。図はリポジトリにコミット済みの .txt ファイルです。レンダラーはオープンソースで、デスクトップ版と VS Code 拡張はサーバーなしで同じファイルを読めます。",
  "landing.faq.q3": "どのリポジトリが対象になりますか？",
  "landing.faq.a3":
    "swimlane トピックが付いていて、かつあなたの GitHub アカウントがすでにアクセスできるものだけです。トピックのないリポジトリは一覧に出ず、変更されることもありません。",
  "landing.faq.q4": "リポジトリ外の人が図を見られますか？",
  "landing.faq.a4":
    "オーナーがリリース済みバージョンを公開した場合に限り、そのバージョンだけが見られます。リンクはランダムな文字列で、ソースを見せるか描画結果だけにするかを選べます。",
  "landing.faq.q5": "なぜ repo スコープが必要なのですか？",
  "landing.faq.a5":
    "プライベートリポジトリの読み取りとコミットを行える、より狭いスコープが GitHub には存在しないためです。トークンは暗号化して保存し、ここで開いたリポジトリにのみ使用します。",
  "landing.faq.q6": "オフラインでも使えますか？",
  "landing.faq.a6":
    "プレビューは常に手元の端末で描画されるため、作図自体にネットワークは不要です。保存と履歴には接続が必要です。完全オフラインで作業する場合は、ローカルフォルダを編集するデスクトップ版があります。",

  // closing
  "landing.closing.title": "すでにあるリポジトリから始めてください",
  "landing.closing.lead":
    "GitHub でサインインし、リポジトリに swimlane トピックを付けて開くだけです。あなたが求めない限り、何も作成されません。",
  "landing.footer.source": "GitHub のソース",
  "landing.footer.rights": "図はあなたのリポジトリに残ります。",

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
    "main / preview ブランチ、サンプル図、セクションテンプレート、.swimlane.json を含むプライベートリポジトリを作成し、swimlane トピックを付けます。チーム / エンタープライズプランが必要です（組織の場合はそのチームの管理者である必要があります）。フリープランのワークスペースは既存のリポジトリをマークしてください。",
  "new.createButton": "リポジトリを作成",
  "new.creating": "作成中…",
  "new.markHint":
    "管理者権限があり、まだマークされていないリポジトリです。マークすると swimlane トピック、preview ブランチ、.swimlane.json が追加されます。それ以外は変更しません。",
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
  "edit.editor": "エディタ",
  "edit.mobile": "モバイル",
  "edit.unsaved": "未保存",
  "edit.myEdit": "自分の編集",
  "edit.startEditing": "編集を開始",
  "edit.backToEdit": "編集に戻る",
  "edit.push": "GitHubに保存",
  "edit.push.title": "変更を GitHub に保存",
  "edit.push.message": "メッセージ（任意）",
  "edit.push.files": "変更したファイル",
  "edit.push.nothing": "保存する変更はありません。",
  "edit.requestReview": "レビューを依頼",
  "edit.review.title": "レビューを依頼",
  "edit.review.unpushed": "GitHub に保存されていない変更があります。先に保存してください。",
  "edit.review.pushFirst": "先に保存",
  "edit.review.noChanges": "承認済みとの差分はありません。",
  "edit.review.titleField": "タイトル（任意）",
  "edit.review.titleDefault": "図を{n}件更新",
  "edit.review.requested": "レビューを依頼しました（#{n}）。管理者が承認します。",
  "edit.underReview": "レビュー中 #{n}",
  "edit.discard": "編集を破棄",
  "edit.discard.confirm": "この編集とすべての変更を破棄しますか？元に戻せません。",
  "edit.status.editing": "編集中",
  "edit.status.underReview": "レビュー中",
  "edit.status.viewer": "読み取り専用",
  "edit.readonly": "読み取り専用：{reason}",
  "edit.lock.main": "main は公開済みのため直接編集できません",
  "edit.lock.locked": "このブランチにはプルリクエストが開かれています",
  "edit.lock.previewOwnerOnly": "preview はリポジトリ管理者のみ編集できます",
  "edit.lock.viewer": "このリポジトリへのアクセスは読み取り専用です",
  "edit.lock.other": "編集できるのは preview と編集ブランチだけです",
  "edit.branchMoved":
    "このブランチは GitHub 上で更新されました。保存の前に再読み込みしてください。",
  "edit.reload": "再読み込み",
  // branches page
  "branches.title": "ブランチ",
  "branches.historyOf": "履歴 · {branch}",
  "branches.confirmUnpublish": "このコミットを非公開にしますか（公開リンクを削除します）？",
  "branches.confirmPublish": "このコミットを公開リンクに公開しますか？",
  // pulls page
  "pulls.title": "プルリクエスト",
  "pulls.ownerHint": "リクエストの承認・却下ができます。",
  "pulls.editorHint": "リポジトリ管理者がリクエストを承認します。",
  "pulls.approve.title": "承認して{base}に反映",
  "pulls.approve.hint": "これらのファイルが承認済みになります。",
  "pulls.reject.confirm": "反映せずに却下しますか？",
  // versions page
  "versions.title": "バージョン",
  "versions.description":
    "preview ブランチからフラグを立て、リリースするには main に昇格してください。",
  "versions.previewDirty":
    "preview に未保存の草稿があります。フラグの前にチェックポイントしてください。",
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
    "プルリクエストはまだありません。編集ページで、編集ブランチから PR を開いてください（→ preview）または preview から（→ main）。",
  "pr.review": "レビューとコメント",
  "pr.hide": "閉じる",
  "pr.openedBy": "{login} が作成",
  "pr.reviewFile": "レビュー（1 ファイル変更）",
  "pr.reviewFiles": "レビュー（{n} ファイル変更）",
  "pr.reject": "却下",
  "pr.approve": "承認して反映 → {base}",
  "pr.ownerMerges": "管理者が承認します",
  "pr.commentAs": "{login} としてコメント…",
  "pr.comment": "コメント",
  // version panel
  "version.empty":
    "バージョンはまだありません。リポジトリ管理者が上の preview ブランチからフラグを立てます。",
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
  // branch labels
  "branch.preview": "承認済み",
  "branch.main": "公開済み",
  "branch.edit": "{user} の編集",
  // change lists
  "changes.empty": "変更はありません。",
  "changes.status.added": "追加",
  "changes.status.changed": "変更",
  "changes.status.removed": "削除",
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
