import * as vscode from "vscode";
import {
  createPullsApi,
  createRestClient,
  isTmpBranch,
  parseRemoteUrl,
  parseRepoConfig,
  tmpBranchName,
} from "@swimlane-cloud/github-client";
import { FsHost } from "./fs-host";
import { Git, NotWritableError } from "./git/git-cli";
import { Repository } from "./git/repository";
import { pushBranch } from "./git/push";
import { findGitPath } from "./git-api";
import { branchExists, resolveBranches, type BranchConfig } from "./git/branches";
import { webviewHtml } from "./webview-panel";
import { peekSession, requireSession } from "./session";
import type { HostMethod, RequestMessage, StatusPayload } from "./protocol";

let panel: vscode.WebviewPanel | undefined;
let log: vscode.OutputChannel;
let extensionContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;
  log = vscode.window.createOutputChannel("Swimlane Git");
  context.subscriptions.push(log);

  const folder = vscode.workspace.workspaceFolders?.[0];
  const gitPath = await findGitPath();
  const git = new Git(gitPath, log);

  context.subscriptions.push(
    vscode.commands.registerCommand("swimlane.showLog", () => log.show()),
    vscode.commands.registerCommand("swimlane.open", () => openEditor(context, git)),
    vscode.commands.registerCommand("swimlane.checkpoint", () => checkpointCommand(git)),
    vscode.commands.registerCommand("swimlane.startEdit", () => startEdit(git, context)),
    vscode.commands.registerCommand("swimlane.publish", () => publish(git)),
  );

  if (!folder) {
    log.appendLine("No workspace folder open; commands will prompt when one is.");
  }
}

export function deactivate(): void {
  panel?.dispose();
}

// ── workspace wiring ─────────────────────────────────────────────────────────

interface Context {
  folder: vscode.WorkspaceFolder;
  host: FsHost;
  repo: Repository | null;
  diagramsRoot: string;
  /** Resolved from .swimlane.json, settings, then the repository itself. */
  branches: BranchConfig;
}

/**
 * Which branches may receive a checkpoint. Built from the resolved config
 * rather than the shared constants, so a repo using `develop` as its
 * integration branch is not told it is on the wrong branch.
 */
function writableBranchPolicy(branches: BranchConfig): (branch: string) => boolean {
  return (branch) =>
    branch !== branches.production && (isTmpBranch(branch) || branch === branches.integration);
}

async function resolveContext(git: Git): Promise<Context | null> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage("Open a folder before using Swimlane Diagrams.");
    return null;
  }

  const repoConfig = await readRepoConfig(folder);
  const diagramsRoot =
    repoConfig?.diagramsRoot ||
    vscode.workspace
      .getConfiguration("swimlane")
      .get<string>("diagramsRoot", "")
      .replace(/^\/+|\/+$/g, "");
  const host = new FsHost(folder.uri, diagramsRoot);

  // Resolve the repository root from the workspace folder itself. A diagrams
  // folder inside a submodule would otherwise commit to the superproject and
  // every pathspec would miss.
  const top = await git.toplevel(folder.uri.fsPath);
  const repo = top ? new Repository(git, top, log) : null;

  const branches = await resolveBranches(git, top ?? folder.uri.fsPath, repoConfig);
  return { folder, host, repo, diagramsRoot, branches };
}

/**
 * `.swimlane.json` from the workspace root. Versioned with the content, so it
 * wins over per-user settings and is shared by everyone on the repo.
 */
async function readRepoConfig(
  folder: vscode.WorkspaceFolder,
): Promise<{ diagramsRoot: string; integrationBranch: string } | null> {
  try {
    const raw = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, ".swimlane.json"),
    );
    return parseRepoConfig(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
}

// ── the webview ──────────────────────────────────────────────────────────────

async function openEditor(context: vscode.ExtensionContext, git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx) return;

  if (panel) {
    panel.reveal();
    return;
  }

  // Reopening on an edit branch resumes that branch's scope rather than
  // silently widening the view back to every diagram.
  const branch = ctx.repo ? await git.currentBranch(ctx.repo.root) : null;
  if (branch) ctx.host.setScope(recallScope(context, branch));

  panel = vscode.window.createWebviewPanel(
    "swimlane.editor",
    "Swimlane Diagrams",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist")],
    },
  );
  panel.webview.html = webviewHtml(panel.webview, context.extensionUri);

  const post = (message: unknown) => void panel?.webview.postMessage(message);

  const watcher = ctx.host.watch((e) => post({ kind: "event", event: "fileChanged", payload: e }));
  const pushStatus = async () =>
    post({ kind: "event", event: "status", payload: await status(git, ctx) });

  panel.webview.onDidReceiveMessage(
    (msg: RequestMessage) => void handleRequest(msg, ctx, git, post, pushStatus),
    undefined,
    context.subscriptions,
  );

  const statusTimer = setInterval(() => void pushStatus(), 5000);
  void pushStatus();

  panel.onDidDispose(() => {
    clearInterval(statusTimer);
    watcher.dispose();
    panel = undefined;
  });
}

/** Methods that mutate the workspace or the repository. */
const WRITE_METHODS = new Set([
  "writeDraft",
  "writeDraftMany",
  "create",
  "mkdir",
  "delete",
  "rmdir",
  "rename",
  "checkpoint",
  "flagNewVersion",
]);

/**
 * Whether editing is permitted right now, and why not.
 *
 * Editing is confined to `tmp-*` branches. The production and integration
 * branches are shared, so an accidental save on one is a change other people
 * receive without review — the whole point of the branch model. Viewing is
 * always allowed; only writes are gated.
 */
async function editability(
  git: Git,
  ctx: Context,
): Promise<{ editable: boolean; reason: string | null }> {
  if (!vscode.workspace.isTrusted) {
    return {
      editable: false,
      reason: "This workspace is not trusted, so git operations are disabled.",
    };
  }
  if (!ctx.repo) return { editable: false, reason: "This workspace is not a git repository." };

  const branch = await git.currentBranch(ctx.repo.root);
  if (!branch) return { editable: false, reason: "HEAD is detached. Check out an edit branch." };

  if (!isTmpBranch(branch)) {
    return {
      editable: false,
      reason: `"${branch}" is not an edit branch. Run "Swimlane: Start Edit" to create one.`,
    };
  }
  return { editable: true, reason: null };
}

async function status(git: Git, ctx: Context): Promise<StatusPayload> {
  const base = {
    trusted: vscode.workspace.isTrusted,
    scope: ctx.host.getScope(),
  };

  if (!ctx.repo) {
    return {
      ...base,
      branch: null,
      dirty: 0,
      gitProblem: "Not a git repository",
      editable: false,
      editableReason: "This workspace is not a git repository.",
    };
  }

  try {
    const branch = await git.currentBranch(ctx.repo.root);
    const { staged, dirty } = await git.status(ctx.repo.root);
    const { editable, reason } = await editability(git, ctx);
    return {
      ...base,
      branch,
      dirty: new Set([...staged, ...dirty]).size,
      gitProblem: branch ? null : "Detached HEAD",
      editable,
      editableReason: reason,
    };
  } catch (err) {
    return {
      ...base,
      branch: null,
      dirty: 0,
      gitProblem: err instanceof Error ? err.message : "git unavailable",
      editable: false,
      editableReason: "git is unavailable in this workspace.",
    };
  }
}

async function handleRequest(
  msg: RequestMessage,
  ctx: Context,
  git: Git,
  post: (m: unknown) => void,
  pushStatus: () => Promise<void>,
): Promise<void> {
  if (msg?.kind !== "request") return;
  try {
    const value = await dispatch(msg.method, msg.args, ctx, git, pushStatus);
    post({ kind: "response", id: msg.id, ok: true, value });
  } catch (err) {
    post({
      kind: "response",
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function dispatch(
  method: HostMethod,
  args: unknown[],
  ctx: Context,
  git: Git,
  pushStatus: () => Promise<void>,
): Promise<unknown> {
  const { host } = ctx;
  const s = (i: number) => String(args[i]);

  // Enforced here, not only in the webview. The read-only editor is a courtesy
  // to the user; this is what actually prevents a write landing on a shared
  // branch, and it holds even if the webview is stale or bypassed.
  if (WRITE_METHODS.has(method)) {
    const { editable, reason } = await editability(git, ctx);
    if (!editable) throw new Error(reason ?? "Editing is not available here.");
  }

  switch (method) {
    case "root":
      return ctx.folder.uri.fsPath;
    case "list":
      return host.list();
    case "read":
      return host.read(s(0));
    case "writeDraft":
      await host.write(s(0), s(1));
      void pushStatus();
      return null;
    case "writeDraftMany":
      await host.writeMany(args[0] as { id: string; dsl: string }[]);
      void pushStatus();
      return null;
    case "create":
      await host.create(s(0), s(1));
      void pushStatus();
      return null;
    case "mkdir":
      return host.mkdir(s(0));
    case "delete":
      return host.delete(s(0));
    case "rmdir":
      return host.rmdir(s(0));
    case "rename":
      return host.rename(s(0), s(1));

    case "checkpoint": {
      const opts = (args[0] ?? {}) as { message?: string; files?: { id: string; dsl: string }[] };
      // The editor only sends dirty documents, and this host writes straight to
      // disk on every save — so by the time Checkpoint runs, `files` is usually
      // empty. Commit what git says has changed under the diagrams root, not
      // what the editor thought was pending.
      await checkpoint(git, ctx, opts.message);
      void pushStatus();
      return null;
    }

    case "flagNewVersion":
      await release(git, ctx, (args[1] as { name: string }).name);
      return null;

    case "alert":
      await vscode.window.showInformationMessage(s(0), { modal: true });
      return null;
    case "confirm": {
      const answer = await vscode.window.showWarningMessage(s(0), { modal: true }, "Yes");
      return answer === "Yes";
    }
    case "prompt": {
      // Returns undefined on cancel where a browser returns null; the webview
      // host normalises that.
      const value = await vscode.window.showInputBox({ prompt: s(0), value: s(1) });
      return value ?? null;
    }
    case "exportFile":
      return exportFile(s(0), s(1), args[2] as "utf8" | "base64");

    default:
      throw new Error(`Unknown host method "${method}".`);
  }
}

/**
 * Export goes through a save dialog: `a[download]` with a blob URL is inert in
 * a webview, so the editor's own export path cannot complete on its own.
 */
async function exportFile(
  name: string,
  contents: string,
  encoding: "utf8" | "base64",
): Promise<boolean> {
  const target = await vscode.window.showSaveDialog({
    saveLabel: "Export diagram",
    defaultUri: vscode.Uri.file(name),
  });
  if (!target) return false;
  const bytes =
    encoding === "base64"
      ? Uint8Array.from(atob(contents), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(contents);
  await vscode.workspace.fs.writeFile(target, bytes);
  return true;
}

// ── git commands ─────────────────────────────────────────────────────────────

/** Command entry point: resolve the workspace, then checkpoint. */
async function checkpointCommand(git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx) return;
  try {
    await checkpoint(git, ctx);
  } catch (err) {
    void vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
  }
}

async function checkpoint(git: Git, ctx: Context, message?: string): Promise<void> {
  if (!ctx.repo) throw new NotWritableError("This workspace is not a git repository.");

  const check = await ctx.repo.assertWritable(writableBranchPolicy(ctx.branches));
  if (!check.ok) {
    if (check.wrongBranch) {
      await offerEditBranch(git, ctx, check.branch ?? "", extensionContext);
      return;
    }
    throw new NotWritableError(check.reason ?? "Cannot write to this repository.");
  }

  const prefix = ctx.diagramsRoot ? `${ctx.diagramsRoot.replace(/\/+$/, "")}/` : "";
  const { staged, dirty } = await git.status(ctx.repo.root);
  const paths = [...new Set([...staged, ...dirty])].filter(
    (p) => p.endsWith(".txt") && (!prefix || p.startsWith(prefix)),
  );

  if (paths.length === 0) {
    void vscode.window.showInformationMessage("No diagram changes to checkpoint.");
    return;
  }

  const text =
    message ??
    (await vscode.window.showInputBox({
      prompt: `Checkpoint ${paths.length} diagram(s)`,
      value: `Update ${paths.length} diagram(s)`,
    }));
  if (text == null) return;

  const sha = await ctx.repo.commitPaths({
    message: text || `Update ${paths.length} diagram(s)`,
    paths,
  });
  void vscode.window.showInformationMessage(
    `Checkpointed ${paths.length} diagram(s) as ${sha.slice(0, 7)}.`,
  );
}

/**
 * Offer to cut an edit branch — the single sanctioned exception to never
 * switching branches. Explicit confirmation, and the repository layer refuses
 * if anything outside the diagrams folder is dirty. Never a stash.
 */
async function offerEditBranch(
  git: Git,
  ctx: Context,
  currentBranch: string,
  context: vscode.ExtensionContext,
): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    `"${currentBranch}" is not an edit branch. Diagrams are edited on a tmp-* branch cut from "${ctx.branches.integration}".`,
    { modal: true },
    "Start an edit branch",
    "Open Source Control",
  );
  if (choice === "Open Source Control") {
    await vscode.commands.executeCommand("workbench.view.scm");
    return;
  }
  if (choice === "Start an edit branch") await startEdit(git, context);
}

/**
 * The edit scope is remembered per branch, so reopening the editor later
 * resumes the same narrowed view rather than silently widening to everything.
 */
const scopeKey = (branch: string) => `swimlane.scope:${branch}`;

/** Narrow the live host and remember the choice for this branch. */
function applyScope(
  ctx: Context,
  branch: string,
  scope: string | null,
  context: vscode.ExtensionContext,
): void {
  ctx.host.setScope(scope);
  rememberScope(context, branch, scope);
  log.appendLine(`edit scope for ${branch}: ${scope ?? "(everything)"}`);
  // The webview's file tree is already rendered, so tell it to reload.
  void panel?.webview.postMessage({ kind: "event", event: "reload", payload: null });
}

function rememberScope(
  context: vscode.ExtensionContext,
  branch: string,
  scope: string | null,
): void {
  void context.workspaceState.update(scopeKey(branch), scope);
}

function recallScope(context: vscode.ExtensionContext, branch: string): string | null {
  return context.workspaceState.get<string | null>(scopeKey(branch), null);
}

/**
 * Ask which folder this edit covers.
 *
 * Scoping is the difference between "I am changing the onboarding diagrams" and
 * "every diagram in the repo is open for editing". Narrowing it up front means
 * a stray save cannot land somewhere the author never intended to touch.
 */
async function pickScope(host: FsHost, diagramsRoot: string): Promise<string | null | undefined> {
  const files = await host.list();
  const folders = new Set<string>();
  for (const f of files) {
    const parts = f.id.split("/");
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join("/"));
  }

  const root = diagramsRoot || "the whole workspace";
  const items: Array<vscode.QuickPickItem & { scope: string | null }> = [
    {
      label: "$(folder-opened) Everything",
      description: root,
      detail: `All ${files.length} diagram(s)`,
      scope: null,
    },
    ...[...folders].sort().map((dir) => ({
      label: `$(folder) ${dir}`,
      detail: `${files.filter((f) => f.id.startsWith(`${dir}/`)).length} diagram(s)`,
      scope: dir,
    })),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: "Which folder does this edit cover?",
    placeHolder: "Only diagrams in this folder will be editable",
    ignoreFocusOut: true,
  });
  // undefined = cancelled, null = deliberately everything.
  return picked === undefined ? undefined : picked.scope;
}

/**
 * Start an edit: create `tmp-<user>-<slug>` from the integration branch.
 *
 * Every failure here is diagnosed specifically. An earlier version wrapped the
 * whole thing in one catch that assumed "the integration branch is missing",
 * which misreported an already-existing branch and offered a recovery that
 * could not work — `git branch test main` fails in a repo whose default branch
 * is `master`.
 */
async function startEdit(git: Git, context: vscode.ExtensionContext): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx?.repo) {
    void vscode.window.showErrorMessage("This workspace is not a git repository.");
    return;
  }
  const { repo, branches } = ctx;

  if (!vscode.workspace.isTrusted) {
    void vscode.window.showErrorMessage(
      "This workspace is not trusted, so git operations are disabled. Creating a branch and committing run the repository's hooks.",
    );
    return;
  }

  // The integration branch usually does not exist in an arbitrary repository.
  // Offer to create it from whatever this repo actually uses as production —
  // never from a hardcoded `main`.
  if (!(await branchExists(git, repo.root, branches.integration))) {
    if (!(await branchExists(git, repo.root, branches.production))) {
      void vscode.window.showErrorMessage(
        `Neither "${branches.integration}" nor "${branches.production}" exists in this repository. ` +
          `Set swimlane.productionBranch to the branch releases are cut from.`,
      );
      return;
    }
    const create = await vscode.window.showInformationMessage(
      `This repository has no "${branches.integration}" branch. Diagrams are edited on branches cut from it.`,
      { modal: true, detail: `It will be created from "${branches.production}".` },
      `Create "${branches.integration}"`,
    );
    if (!create) return;
    try {
      await git.run(["branch", branches.integration, branches.production], { cwd: repo.root });
      log.appendLine(`created ${branches.integration} from ${branches.production}`);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Could not create "${branches.integration}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
  }

  const name = await vscode.window.showInputBox({
    prompt: "What are you changing?",
    placeHolder: "expense approval",
    validateInput: (v) => (v.trim() ? null : "Give the edit a short name."),
  });
  if (!name) return;

  // Choose the folder BEFORE creating the branch: if the user backs out here,
  // no branch has been created and nothing needs undoing.
  const scope = await pickScope(ctx.host, ctx.diagramsRoot);
  if (scope === undefined) return;

  const session = await peekSession();
  const branch = tmpBranchName(session?.account.label ?? "local", name);

  // Re-running Start Edit with the same name is ordinary, not an error.
  if (await branchExists(git, repo.root, branch)) {
    const current = await git.currentBranch(repo.root);
    if (current === branch) {
      void vscode.window.showInformationMessage(`Already editing on ${branch}.`);
      return;
    }
    const swap = await vscode.window.showInformationMessage(
      `"${branch}" already exists.`,
      { modal: true, detail: "Switch to it and continue that edit?" },
      "Switch to it",
    );
    if (!swap) return;
    try {
      await git.run(["switch", branch], { cwd: repo.root });
      applyScope(ctx, branch, recallScope(context, branch), context);
      void vscode.window.showInformationMessage(`Now editing on ${branch}.`);
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Could not switch to ${branch}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  try {
    await repo.startEditBranch(branch, branches.integration, ctx.diagramsRoot);
    applyScope(ctx, branch, scope, context);
    void vscode.window.showInformationMessage(
      `Now editing on ${branch}${scope ? ` — scoped to ${scope}` : ""}.`,
    );
  } catch (err) {
    // startEditBranch refuses when unrelated work is dirty; that message is
    // already actionable and must not be replaced with a guess.
    const message = err instanceof Error ? err.message : String(err);
    const action = await vscode.window.showErrorMessage(message, "Open Source Control");
    if (action) await vscode.commands.executeCommand("workbench.view.scm");
  }
}

async function publish(git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx?.repo) {
    void vscode.window.showErrorMessage("This workspace is not a git repository.");
    return;
  }

  const branch = await git.currentBranch(ctx.repo.root);
  if (!branch || !isTmpBranch(branch)) {
    void vscode.window.showErrorMessage(
      `Publish from an edit branch, not "${branch ?? "a detached HEAD"}".`,
    );
    return;
  }

  const remoteUrl = await git.remoteUrl(ctx.repo.root);
  const parsed = remoteUrl ? parseRemoteUrl(remoteUrl) : null;
  if (!parsed) {
    void vscode.window.showErrorMessage("The 'origin' remote is not a GitHub repository.");
    return;
  }

  // Refuse to push over commits we do not have.
  const div = await ctx.repo.divergence(branch);
  if (div && div.behind > 0) {
    void vscode.window.showErrorMessage(
      `origin/${branch} has ${div.behind} commit(s) you do not have. Pull them first — this extension never force-pushes.`,
    );
    return;
  }

  // Only now, on an explicit action, do we ask for credentials.
  const session = await requireSession();
  const outcome = await pushBranch(git, {
    cwd: ctx.repo.root,
    branch,
    token: session?.accessToken ?? null,
  });

  if (!outcome.ok) {
    // Bottom tier: stop after the local commit and show the exact command. The
    // PR step is independently re-runnable once the branch is pushed.
    const actions = [
      outcome.ssoUrl ? "Authorise SSO" : undefined,
      "Copy git push command",
      "Show Log",
    ].filter(Boolean) as string[];
    const answer = await vscode.window.showErrorMessage(
      outcome.reason ?? "Push failed.",
      ...actions,
    );
    if (answer === "Authorise SSO" && outcome.ssoUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(outcome.ssoUrl));
    } else if (answer === "Copy git push command" && outcome.manualCommand) {
      await vscode.env.clipboard.writeText(outcome.manualCommand);
    } else if (answer === "Show Log") {
      log.show();
    }
    return;
  }

  if (!session) {
    void vscode.window.showInformationMessage(
      `Pushed ${branch}. Sign in to GitHub to open a pull request.`,
    );
    return;
  }

  const rest = createRestClient({ getToken: () => session.accessToken });
  const pulls = createPullsApi(rest, { owner: parsed.owner, repo: parsed.repo });

  const existing = await pulls.listPullRequests({ head: branch, state: "open" });
  const pull =
    existing[0] ??
    // assertMergeTarget inside the client refuses tmp-* -> main, so this can
    // only ever target the integration branch.
    (await pulls.createPullRequest({
      head: branch,
      base: ctx.branches.integration,
      title: `Update diagrams (${branch})`,
    }));

  // A unified diff of DSL source is close to unreadable for a reviewer who did
  // not write it, so offer the visual review page when a hub is configured.
  const hub = vscode.workspace
    .getConfiguration("swimlane")
    .get<string>("hubUrl", "")
    .replace(/\/+$/, "");
  const actions = ["Open on GitHub", ...(hub ? ["Review diagrams"] : [])];

  const open = await vscode.window.showInformationMessage(
    `Pull request #${pull.number} ${existing[0] ? "updated" : "opened"}.`,
    ...actions,
  );
  if (open === "Open on GitHub") {
    await vscode.env.openExternal(vscode.Uri.parse(pull.htmlUrl));
  } else if (open === "Review diagrams") {
    await vscode.env.openExternal(
      vscode.Uri.parse(`${hub}/${parsed.owner}/${parsed.repo}/pull/${pull.number}`),
    );
  }
}

/**
 * Cut a release: tag the production branch.
 *
 * The commit must exist on the remote before the tag is created, or the
 * Releases API rejects an unknown sha.
 */
async function release(git: Git, ctx: Context, name: string): Promise<void> {
  if (!ctx.repo) throw new NotWritableError("This workspace is not a git repository.");

  const remoteUrl = await git.remoteUrl(ctx.repo.root);
  const parsed = remoteUrl ? parseRemoteUrl(remoteUrl) : null;
  if (!parsed) throw new Error("The 'origin' remote is not a GitHub repository.");

  const session = await requireSession();
  if (!session) throw new Error("Sign in to GitHub to publish a release.");

  const rest = createRestClient({ getToken: () => session.accessToken });
  const prod = await rest.request<{ object: { sha: string } }>(
    `/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${ctx.branches.production}`,
  );

  await rest.request(`/repos/${parsed.owner}/${parsed.repo}/releases`, {
    method: "POST",
    body: { tag_name: name, name, target_commitish: ctx.branches.production },
  });

  void vscode.window.showInformationMessage(
    `Released ${name} at ${prod.object.sha.slice(0, 7)} on ${ctx.branches.production}.`,
  );
}
