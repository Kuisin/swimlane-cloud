import { textToSvg } from "@swimlane-cloud/diagram-converter";
import { demoSeed } from "./demo";
import type { EditorHost, FileRef } from "./saas-host";

/**
 * Client-side simulation of the git-backed SaaS workflow (plan Part B) for the
 * no-backend demo. Models main/test/tmp-* branches, checkpoints (commits),
 * pull requests (tmp→test, merged by a manager), and versions (flagged on test,
 * promoted to main). State lives in localStorage; SVG snapshots are rendered
 * with the same engine the real server uses.
 */

export type Role = "manager" | "member";
export type Files = Record<string, string>;

export interface Commit {
  id: string;
  message: string;
  author: Role;
  ts: number;
  files: Files;
}
export interface Branch {
  name: string;
  base: string | null;
  commits: Commit[]; // oldest → newest; tip = last
}
export interface PullRequest {
  id: string;
  title: string;
  head: string;
  base: string;
  status: "open" | "merged";
  author: Role;
  ts: number;
  mergedTs?: number;
}
export interface Version {
  id: string;
  name: string;
  note: string;
  branch: "test";
  commitId: string;
  files: Files;
  svg: string | null;
  promoted: boolean;
  ts: number;
}
export interface WorkflowState {
  role: Role;
  activeBranch: string;
  branches: Record<string, Branch>;
  prs: PullRequest[];
  versions: Version[];
}

const META = (pid: string) => `swimlane-wf:${pid}`;
const WORK = (pid: string) => `swimlane-wf-working:${pid}`;

const now = () => Date.now();
export const genId = (p: string) =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "edit"
  );
}

export function tip(branch?: Branch): Commit | null {
  if (!branch || branch.commits.length === 0) return null;
  return branch.commits[branch.commits.length - 1];
}
export function tipFiles(branch?: Branch): Files {
  return tip(branch)?.files ?? {};
}

/** primary diagram = first .txt path (sorted) for thumbnails/version SVG. */
export function primaryPath(files: Files): string | null {
  const txt = Object.keys(files)
    .filter((p) => p.endsWith(".txt"))
    .sort();
  return txt[0] ?? null;
}

// ---- persistence ----

function loadWorking(pid: string): Record<string, Files> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(WORK(pid)) || "{}");
  } catch {
    return {};
  }
}
function saveWorking(pid: string, w: Record<string, Files>) {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(WORK(pid), JSON.stringify(w));
}

function defaultState(pid: string): WorkflowState {
  const seed = demoSeed(pid);
  const c0: Commit = {
    id: genId("c"),
    message: "Initial import",
    author: "manager",
    ts: now(),
    files: { ...seed },
  };
  return {
    role: "member",
    activeBranch: "test",
    branches: {
      main: { name: "main", base: null, commits: [c0] },
      test: { name: "test", base: "main", commits: [{ ...c0, id: genId("c") }] },
    },
    prs: [],
    versions: [],
  };
}

export function loadState(pid: string): WorkflowState {
  if (typeof localStorage === "undefined") return defaultState(pid);
  const raw = localStorage.getItem(META(pid));
  if (!raw) {
    const st = defaultState(pid);
    saveState(pid, st);
    // seed working copies for main + test from their tips
    const w: Record<string, Files> = {};
    for (const b of Object.values(st.branches)) w[b.name] = { ...tipFiles(b) };
    saveWorking(pid, w);
    return st;
  }
  try {
    return JSON.parse(raw) as WorkflowState;
  } catch {
    return defaultState(pid);
  }
}
export function saveState(pid: string, st: WorkflowState) {
  if (typeof localStorage !== "undefined")
    localStorage.setItem(META(pid), JSON.stringify(st));
}

export function getWorking(pid: string, branch: string): Files {
  const w = loadWorking(pid);
  return w[branch] ?? {};
}
function setWorking(pid: string, branch: string, files: Files) {
  const w = loadWorking(pid);
  w[branch] = files;
  saveWorking(pid, w);
}

export function resetDemo(pid: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(META(pid));
  localStorage.removeItem(WORK(pid));
}

// ---- actions (mutate + persist, return new state) ----

export function setRole(pid: string, st: WorkflowState, role: Role): WorkflowState {
  const next = { ...st, role };
  saveState(pid, next);
  return next;
}

export function setActiveBranch(
  pid: string,
  st: WorkflowState,
  branch: string,
): WorkflowState {
  const next = { ...st, activeBranch: branch };
  saveState(pid, next);
  return next;
}

export function startEdit(
  pid: string,
  st: WorkflowState,
  name: string,
): WorkflowState {
  const branchName = `tmp-${st.role}-${slug(name)}`;
  const base = st.branches.test;
  const next: WorkflowState = {
    ...st,
    branches: {
      ...st.branches,
      [branchName]: { name: branchName, base: "test", commits: [...base.commits] },
    },
    activeBranch: branchName,
  };
  setWorking(pid, branchName, { ...tipFiles(base) });
  saveState(pid, next);
  return next;
}

export function checkpoint(
  pid: string,
  st: WorkflowState,
  branch: string,
  message: string,
): WorkflowState {
  const files = getWorking(pid, branch);
  const b = st.branches[branch];
  if (!b) return st;
  const commit: Commit = {
    id: genId("c"),
    message: message || "Checkpoint",
    author: st.role,
    ts: now(),
    files: { ...files },
  };
  const next: WorkflowState = {
    ...st,
    branches: {
      ...st.branches,
      [branch]: { ...b, commits: [...b.commits, commit] },
    },
  };
  saveState(pid, next);
  return next;
}

export function openPR(
  pid: string,
  st: WorkflowState,
  head: string,
  title: string,
): WorkflowState {
  const pr: PullRequest = {
    id: genId("pr"),
    title: title || `Merge ${head} into test`,
    head,
    base: "test",
    status: "open",
    author: st.role,
    ts: now(),
  };
  const next = { ...st, prs: [pr, ...st.prs] };
  saveState(pid, next);
  return next;
}

export function mergePR(pid: string, st: WorkflowState, prId: string): WorkflowState {
  const pr = st.prs.find((p) => p.id === prId);
  if (!pr || pr.status !== "open") return st;
  const head = st.branches[pr.head];
  const base = st.branches[pr.base];
  if (!head || !base) return st;
  const mergeCommit: Commit = {
    id: genId("c"),
    message: `Merge PR: ${pr.title}`,
    author: "manager",
    ts: now(),
    files: { ...tipFiles(head) },
  };
  setWorking(pid, pr.base, { ...mergeCommit.files });
  const next: WorkflowState = {
    ...st,
    branches: {
      ...st.branches,
      [pr.base]: { ...base, commits: [...base.commits, mergeCommit] },
    },
    prs: st.prs.map((p) =>
      p.id === prId ? { ...p, status: "merged", mergedTs: now() } : p,
    ),
  };
  saveState(pid, next);
  return next;
}

export function flagVersion(
  pid: string,
  st: WorkflowState,
  name: string,
  note: string,
): WorkflowState {
  const test = st.branches.test;
  const t = tip(test);
  if (!t) return st;
  const pp = primaryPath(t.files);
  let svg: string | null = null;
  if (pp) {
    try {
      svg = textToSvg(t.files[pp], { themeKey: "basic" }).svg;
    } catch {
      svg = null;
    }
  }
  const version: Version = {
    id: genId("v"),
    name: name || `Version ${st.versions.length + 1}`,
    note,
    branch: "test",
    commitId: t.id,
    files: { ...t.files },
    svg,
    promoted: false,
    ts: now(),
  };
  const next = { ...st, versions: [version, ...st.versions] };
  saveState(pid, next);
  return next;
}

export function promote(pid: string, st: WorkflowState, versionId: string): WorkflowState {
  const v = st.versions.find((x) => x.id === versionId);
  if (!v || v.promoted) return st;
  const main = st.branches.main;
  const commit: Commit = {
    id: genId("c"),
    message: `Promote version: ${v.name}`,
    author: "manager",
    ts: now(),
    files: { ...v.files },
  };
  setWorking(pid, "main", { ...v.files });
  const next: WorkflowState = {
    ...st,
    branches: {
      ...st.branches,
      main: { ...main, commits: [...main.commits, commit] },
    },
    versions: st.versions.map((x) =>
      x.id === versionId ? { ...x, promoted: true } : x,
    ),
  };
  saveState(pid, next);
  return next;
}

// ---- editor host bound to a branch's working copy ----

export function createWorkflowHost(
  pid: string,
  branch: string,
  readOnly: boolean,
): EditorHost {
  const read = () => getWorking(pid, branch);
  const write = (files: Files) => setWorking(pid, branch, files);
  return {
    capabilities: { readOnly, versioning: false },
    async list(): Promise<FileRef[]> {
      return Object.keys(read()).map((id) => ({
        id,
        name: id.split("/").pop() ?? id,
      }));
    },
    async read(id) {
      return read()[id] ?? "";
    },
    async writeDraft(id, dsl) {
      const f = read();
      f[id] = dsl;
      write(f);
    },
    async writeDraftMany(updates) {
      const f = read();
      for (const u of updates) f[u.id] = u.dsl;
      write(f);
    },
    async create(id, dsl) {
      const f = read();
      f[id] = dsl;
      write(f);
    },
    async mkdir(dir) {
      const f = read();
      const keep = dir.replace(/\/+$/, "") + "/.keep";
      if (!(keep in f)) {
        f[keep] = "";
        write(f);
      }
    },
  };
}
