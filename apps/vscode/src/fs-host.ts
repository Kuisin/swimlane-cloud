/**
 * The filesystem side of the EditorHost, over `vscode.workspace.fs`.
 *
 * A direct port of `apps/desktop/src/desktop-host.js` (62 lines), with one
 * deliberate departure: that host's `list()` calls `readTxtFiles()`, which
 * returns `{name, content, mtime}` for every file and then throws the content
 * away. On a large workspace that is a full read of every diagram on mount, so
 * this uses `findFiles` and stats only what it lists.
 */

import * as vscode from "vscode";

export interface FileRef {
  id: string;
  name: string;
  mtime?: number;
}

/** Guard against a path escaping the workspace via `..` or an absolute id. */
function assertInside(root: vscode.Uri, target: vscode.Uri): void {
  const rootPath = root.path.endsWith("/") ? root.path : `${root.path}/`;
  if (target.path !== root.path && !target.path.startsWith(rootPath)) {
    throw new Error("Refusing to touch a path outside the workspace folder.");
  }
}

export class FsHost {
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(
    private readonly workspaceRoot: vscode.Uri,
    /** Diagrams subfolder, or "" for the whole workspace. */
    private readonly diagramsRoot: string,
  ) {}

  /** POSIX path relative to the workspace root — the `id` the editor uses. */
  private uri(id: string): vscode.Uri {
    if (id.startsWith("/") || id.includes("\\")) throw new Error(`Invalid diagram id "${id}".`);
    const uri = vscode.Uri.joinPath(this.workspaceRoot, ...id.split("/"));
    assertInside(this.workspaceRoot, uri);
    return uri;
  }

  get scopedRoot(): string {
    return this.diagramsRoot;
  }

  /** `findFiles` honours files.exclude / search.exclude for free. */
  async list(): Promise<FileRef[]> {
    const prefix = this.diagramsRoot ? `${this.diagramsRoot.replace(/\/+$/, "")}/` : "";
    const pattern = new vscode.RelativePattern(this.workspaceRoot, `${prefix}**/*.txt`);
    const uris = await vscode.workspace.findFiles(pattern, "**/node_modules/**", 5000);

    const refs = await Promise.all(
      uris.map(async (uri) => {
        const id = vscode.workspace.asRelativePath(uri, false).split("\\").join("/");
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          return { id, name: id, mtime: stat.mtime };
        } catch {
          return { id, name: id };
        }
      }),
    );
    return refs.sort((a, b) => a.id.localeCompare(b.id));
  }

  async read(id: string): Promise<string> {
    return this.decoder.decode(await vscode.workspace.fs.readFile(this.uri(id)));
  }

  /**
   * A filesystem host has no draft layer — writing the file IS the save, and
   * git is what makes it recoverable. Same mapping the desktop host uses.
   */
  async write(id: string, dsl: string): Promise<void> {
    const uri = this.uri(id);
    const parent = vscode.Uri.joinPath(uri, "..");
    await vscode.workspace.fs.createDirectory(parent);
    await vscode.workspace.fs.writeFile(uri, this.encoder.encode(dsl));
  }

  async writeMany(updates: { id: string; dsl: string }[]): Promise<void> {
    // Sequential on purpose: a partial batch should report which path failed,
    // not lose the rest to an aggregate rejection.
    for (const u of updates) await this.write(u.id, u.dsl);
  }

  async create(id: string, dsl: string): Promise<void> {
    const uri = this.uri(id);
    try {
      await vscode.workspace.fs.stat(uri);
      throw new Error(`${id} already exists.`);
    } catch (err) {
      if (err instanceof Error && err.message.endsWith("already exists.")) throw err;
    }
    await this.write(id, dsl);
  }

  async mkdir(dirPath: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.uri(dirPath));
  }

  async delete(id: string): Promise<void> {
    await vscode.workspace.fs.delete(this.uri(id), { useTrash: true });
  }

  async rmdir(dirPath: string): Promise<void> {
    await vscode.workspace.fs.delete(this.uri(dirPath), { recursive: true, useTrash: true });
  }

  async rename(fromId: string, toId: string): Promise<void> {
    const to = this.uri(toId);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(to, ".."));
    await vscode.workspace.fs.rename(this.uri(fromId), to, { overwrite: false });
  }

  /**
   * Adapts a FileSystemWatcher to the editor's `{id, dsl, type}` shape, exactly
   * as desktop-host.js:54-59 adapts chokidar.
   */
  watch(
    cb: (e: { id: string; dsl: string | null; type: "add" | "change" | "unlink" }) => void,
  ): vscode.Disposable {
    const prefix = this.diagramsRoot ? `${this.diagramsRoot.replace(/\/+$/, "")}/` : "";
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.workspaceRoot, `${prefix}**/*.txt`),
    );
    const relative = (uri: vscode.Uri) =>
      vscode.workspace.asRelativePath(uri, false).split("\\").join("/");

    const emit = async (uri: vscode.Uri, type: "add" | "change") => {
      try {
        cb({ id: relative(uri), dsl: await this.read(relative(uri)), type });
      } catch {
        /* the file vanished between the event and the read */
      }
    };

    watcher.onDidCreate((uri) => void emit(uri, "add"));
    watcher.onDidChange((uri) => void emit(uri, "change"));
    watcher.onDidDelete((uri) => cb({ id: relative(uri), dsl: null, type: "unlink" }));
    return watcher;
  }
}
