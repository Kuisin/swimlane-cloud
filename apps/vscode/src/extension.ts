import * as vscode from "vscode";
import {
  editBranchName,
  INTEGRATION_BRANCH,
  isEditBranch,
  isWritableBranch,
  parseRemoteUrl,
  parseRepoConfig,
  PROD_BRANCH,
  createPullsApi,
  createRestClient,
} from "@swimlane-cloud/github-client";
import { FsHost } from "./fs-host";
import { Git, NotWritableError } from "./git/git-cli";
import { Repository } from "./git/repository";
import { pushBranch } from "./git/push";
import { findGitPath } from "./git-api";
import { webviewHtml } from "./webview-panel";
import { peekSession, requireSession } from "./session";
import type { HostMethod, RequestMessage, StatusPayload } from "./protocol";

let panel: vscode.WebviewPanel | undefined;
let log: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log = vscode.window.createOutputChannel("Swimlane Git");
  context.subscriptions.push(log);

  const folder = vscode.workspace.workspaceFolders?.[0];
  const gitPath = await findGitPath();
  const git = new Git(gitPath, log);

  context.subscriptions.push(
    vscode.commands.registerCommand("swimlane.showLog", () => log.show()),
    vscode.commands.registerCommand("swimlane.open", () => openEditor(context, git)),
    vscode.commands.registerCommand("swimlane.checkpoint", () => checkpointCommand(git)),
    vscode.commands.registerCommand("swimlane.startEdit", () => startEdit(git)),
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
}

async function resolveContext(git: Git): Promise<Context | null> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage("Open a folder before using Swimlane Diagrams.");
    return null;
  }

  const diagramsRoot = await readDiagramsRoot(folder);
  const host = new FsHost(folder.uri, diagramsRoot);

  // Resolve the repository root from the workspace folder itself. A diagrams
  // folder inside a submodule would otherwise commit to the superproject and
  // every pathspec would miss.
  const top = await git.toplevel(folder.uri.fsPath);
  const repo = top ? new Repository(git, top, log) : null;

  return { folder, host, repo, diagramsRoot };
}

/** `.swimlane.json` wins over the VS Code setting: it is versioned with the content. */
async function readDiagramsRoot(folder: vscode.WorkspaceFolder): Promise<string> {
  try {
    const raw = await vscode.workspace.fs.readFile(
      vscode.Uri.joinPath(folder.uri, ".swimlane.json"),
    );
    const config = parseRepoConfig(new TextDecoder().decode(raw));
    if (config.diagramsRoot) return config.diagramsRoot;
  } catch {
    /* no repo config, fall through to the setting */
  }
  return vscode.workspace
    .getConfiguration("swimlane")
    .get<string>("diagramsRoot", "")
    .replace(/^\/+|\/+$/g, "");
}

// ── the webview ──────────────────────────────────────────────────────────────

async function openEditor(context: vscode.ExtensionContext, git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx) return;

  if (panel) {
    panel.reveal();
    return;
  }

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

async function status(git: Git, ctx: Context): Promise<StatusPayload> {
  if (!ctx.repo) {
    return {
      branch: null,
      dirty: 0,
      trusted: vscode.workspace.isTrusted,
      gitProblem: "Not a git repository",
    };
  }
  try {
    const branch = await git.currentBranch(ctx.repo.root);
    const { staged, dirty } = await git.status(ctx.repo.root);
    return {
      branch,
      dirty: new Set([...staged, ...dirty]).size,
      trusted: vscode.workspace.isTrusted,
      gitProblem: branch ? null : "Detached HEAD",
    };
  } catch (err) {
    return {
      branch: null,
      dirty: 0,
      trusted: vscode.workspace.isTrusted,
      gitProblem: err instanceof Error ? err.message : "git unavailable",
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

  const check = await ctx.repo.assertWritable(isWritableBranch);
  if (!check.ok) {
    if (check.wrongBranch) {
      await offerEditBranch(git, ctx, check.branch ?? "");
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
async function offerEditBranch(git: Git, ctx: Context, currentBranch: string): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    `"${currentBranch}" is not an edit branch. Diagrams are edited on a branch cut from "${INTEGRATION_BRANCH}".`,
    { modal: true },
    "Start an edit branch",
    "Open Source Control",
  );
  if (choice === "Open Source Control") {
    await vscode.commands.executeCommand("workbench.view.scm");
    return;
  }
  if (choice === "Start an edit branch") await startEdit(git);
}

async function startEdit(git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx?.repo) {
    void vscode.window.showErrorMessage("This workspace is not a git repository.");
    return;
  }

  const session = await peekSession();
  const branch = editBranchName(session?.account.label ?? "local");

  try {
    await ctx.repo.startEditBranch(branch, INTEGRATION_BRANCH, ctx.diagramsRoot);
    void vscode.window.showInformationMessage(`Now editing on ${branch}.`);
  } catch (err) {
    if (err instanceof NotWritableError) {
      void vscode.window.showErrorMessage(err.message, "Open Source Control").then((a) => {
        if (a) void vscode.commands.executeCommand("workbench.view.scm");
      });
      return;
    }
    // The integration branch may simply not exist yet, which is the normal
    // state of an arbitrary GitHub repository.
    const create = await vscode.window.showWarningMessage(
      `Could not branch from "${INTEGRATION_BRANCH}". Create it from "${PROD_BRANCH}"?`,
      { modal: true },
      "Create it",
    );
    if (create !== "Create it") return;
    await git.run(["branch", INTEGRATION_BRANCH, PROD_BRANCH], { cwd: ctx.repo.root });
    await ctx.repo.startEditBranch(branch, INTEGRATION_BRANCH, ctx.diagramsRoot);
  }
}

async function publish(git: Git): Promise<void> {
  const ctx = await resolveContext(git);
  if (!ctx?.repo) {
    void vscode.window.showErrorMessage("This workspace is not a git repository.");
    return;
  }

  const branch = await git.currentBranch(ctx.repo.root);
  if (!branch || !isEditBranch(branch)) {
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
    // assertMergeTarget inside the client refuses an edit branch -> main, so this can
    // only ever target the integration branch.
    (await pulls.createPullRequest({
      head: branch,
      base: INTEGRATION_BRANCH,
      title: `Update diagrams (${branch})`,
    }));

  const open = await vscode.window.showInformationMessage(
    `Pull request #${pull.number} ${existing[0] ? "updated" : "opened"}.`,
    "Open on GitHub",
  );
  if (open) await vscode.env.openExternal(vscode.Uri.parse(pull.htmlUrl));
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
    `/repos/${parsed.owner}/${parsed.repo}/git/ref/heads/${PROD_BRANCH}`,
  );

  await rest.request(`/repos/${parsed.owner}/${parsed.repo}/releases`, {
    method: "POST",
    body: { tag_name: name, name, target_commitish: PROD_BRANCH },
  });

  void vscode.window.showInformationMessage(
    `Released ${name} at ${prod.object.sha.slice(0, 7)} on ${PROD_BRANCH}.`,
  );
}
