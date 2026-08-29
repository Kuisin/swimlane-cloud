// browser-host.js
//
// An EditorHost (plan.md §A4) implemented over localStorage. No backend, no
// login: the standalone web app's entire persistence layer.
//
// Storage layout (single localStorage key):
//   swimlane-web-files -> { [posixRelPath]: { content: string, mtime: number } }
//   swimlane-web-dirs  -> string[]   // explicit empty-folder markers (mkdir)
//
// `id` is always a POSIX relative path (e.g. "ops/onboarding/flow.txt") so the
// editor can build the folder tree by splitting on "/".

const FILES_KEY = "swimlane-web-files";
const DIRS_KEY = "swimlane-web-dirs";

// --- low-level storage helpers ------------------------------------------------

function readFiles() {
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeFiles(files) {
  localStorage.setItem(FILES_KEY, JSON.stringify(files));
}

function readDirs() {
  try {
    const raw = localStorage.getItem(DIRS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDirs(dirs) {
  localStorage.setItem(DIRS_KEY, JSON.stringify([...new Set(dirs)]));
}

function basename(id) {
  const parts = id.split("/");
  return parts[parts.length - 1];
}

// --- first-run seed -----------------------------------------------------------

const SAMPLE_EXPENSE = `@kai-swimlane

/title/
経費申請フロー

/role/

<role_applicant>
label: 申請者;
text-color: #1e293b;
background-color: #ffffff;

<role_system>
label: システム;
text-color: #3730a3;
background-color: #eef2ff;
icon: #database;

/block/

<block_apply>
background-color: #dbeafe;
text-color: #1e40af;
border-color: #2563eb;
shape: rounded;
icon: #zap;

<block_system>
background-color: #e0e7ff;
text-color: #3730a3;
border-color: #4f46e5;
shape: rect;
icon: #database;

/prop/

<REQ_DOC>
label: 経費申請書;
side: right;

/line/

[role_applicant: 領収書を添付して申請] <block_apply>
label: 申請入力;
desc: 入力内容を確認して送信する;
props: REQ_DOC;

[role_system: 申請を受け付ける] <block_system>

[role_applicant: 申請結果を確認]

@end
`;

const SAMPLE_ONBOARDING = `@kai-swimlane

/title/
オンボーディングフロー

/role/

<role_hr>
label: 人事;
text-color: #075985;
background-color: #f0f9ff;
icon: #users;

<role_newhire>
label: 新入社員;
text-color: #1e293b;
background-color: #ffffff;

/block/

<block_step>
background-color: #dcfce7;
text-color: #166534;
border-color: #16a34a;
shape: rounded;

/line/

[role_hr: アカウントを発行] <block_step>
label: 環境準備;

[role_newhire: 初期設定を完了] <block_step>

[role_hr: オリエンテーションを実施]

@end
`;

const SAMPLE_HIRING = `@kai-swimlane

/title/
採用フロー

/role/

<role_recruiter>
label: 採用担当;
text-color: #7c2d12;
background-color: #fff7ed;
icon: #user;

/block/

<block_review>
background-color: #fef9c3;
text-color: #854d0e;
border-color: #ca8a04;
shape: subroutine;

/line/

[role_recruiter: 書類選考] <block_review>
label: スクリーニング;

if (合格) is (はい) than
  [role_recruiter: 面接を設定]
elseif (いいえ) than
  [role_recruiter: お見送り連絡]
endif

@end
`;

function seedIfEmpty() {
  const files = readFiles();
  const dirs = readDirs();
  if (Object.keys(files).length > 0 || dirs.length > 0) return;

  const now = Date.now();
  const seeded = {
    "ops/onboarding/flow.txt": { content: SAMPLE_ONBOARDING, mtime: now },
    "ops/expenses/approval.txt": { content: SAMPLE_EXPENSE, mtime: now },
    "hr/hiring.txt": { content: SAMPLE_HIRING, mtime: now },
  };
  writeFiles(seeded);
}

// --- cross-tab watch ----------------------------------------------------------

const watchers = new Set();

function notifyWatchers(event) {
  for (const cb of watchers) {
    try {
      cb(event);
    } catch {
      // a misbehaving watcher must not break persistence
    }
  }
}

if (typeof window !== "undefined") {
  // Another tab mutated storage. We don't have a precise diff, so emit a
  // generic "change" the editor can use to refresh; id null = "reload list".
  window.addEventListener("storage", (e) => {
    if (e.key === FILES_KEY || e.key === DIRS_KEY) {
      notifyWatchers({ id: null, dsl: null, type: "change" });
    }
  });
}

// --- EditorHost implementation ------------------------------------------------

export const browserHost = {
  async root() {
    return "Browser storage";
  },

  async list() {
    seedIfEmpty();
    const files = readFiles();
    const refs = Object.entries(files).map(([id, entry]) => ({
      id,
      name: basename(id),
      mtime: entry?.mtime,
    }));

    // Surface empty folders (mkdir markers) so they appear in the tree. The
    // editor builds folders by splitting ids on "/", so we emit a hidden
    // ".keep" placeholder path under each marked dir that has no real files yet.
    const dirs = readDirs();
    const existingDirs = new Set(
      refs.filter((r) => r.id.includes("/")).map((r) => r.id.slice(0, r.id.lastIndexOf("/"))),
    );
    for (const dir of dirs) {
      const hasFiles = [...existingDirs].some((d) => d === dir || d.startsWith(dir + "/"));
      if (!hasFiles) {
        refs.push({ id: `${dir}/.keep`, name: ".keep" });
      }
    }
    return refs;
  },

  async read(id) {
    const files = readFiles();
    const entry = files[id];
    if (!entry) throw new Error(`File not found: ${id}`);
    return entry.content;
  },

  async writeDraft(id, dsl) {
    const files = readFiles();
    files[id] = { content: dsl, mtime: Date.now() };
    writeFiles(files);
    notifyWatchers({ id, dsl, type: "change" });
  },

  async writeDraftMany(updates) {
    const files = readFiles();
    const now = Date.now();
    for (const { id, dsl } of updates) {
      files[id] = { content: dsl, mtime: now };
    }
    writeFiles(files);
    for (const { id, dsl } of updates) {
      notifyWatchers({ id, dsl, type: "change" });
    }
  },

  async create(id, dsl) {
    const files = readFiles();
    files[id] = { content: dsl ?? "", mtime: Date.now() };
    writeFiles(files);

    // If the new file lives under a previously-empty folder marker, the file
    // now represents that folder; the marker is no longer needed.
    const dir = id.includes("/") ? id.slice(0, id.lastIndexOf("/")) : "";
    if (dir) {
      const dirs = readDirs().filter((d) => d !== dir && !dir.startsWith(d + "/"));
      writeDirs(dirs);
    }

    notifyWatchers({ id, dsl: dsl ?? "", type: "add" });
  },

  async mkdir(dirPath) {
    const clean = dirPath.replace(/\/+$/, "");
    if (!clean) return;
    const dirs = readDirs();
    dirs.push(clean);
    writeDirs(dirs);
    notifyWatchers({ id: null, dsl: null, type: "change" });
  },

  async delete(id) {
    const files = readFiles();
    if (!Object.prototype.hasOwnProperty.call(files, id)) {
      throw new Error(`File not found: ${id}`);
    }
    delete files[id];
    writeFiles(files);
    notifyWatchers({ id, dsl: null, type: "unlink" });
  },

  async rmdir(dirPath) {
    const prefix = dirPath.replace(/\/+$/, "") + "/";
    const files = readFiles();
    const toDelete = Object.keys(files).filter((k) => k === dirPath || k.startsWith(prefix));
    for (const k of toDelete) delete files[k];
    writeFiles(files);
    const dirs = readDirs().filter((d) => d !== dirPath && !d.startsWith(prefix));
    writeDirs(dirs);
    for (const k of toDelete) notifyWatchers({ id: k, dsl: null, type: "unlink" });
    notifyWatchers({ id: null, dsl: null, type: "change" });
  },

  async rename(fromId, toId) {
    const files = readFiles();
    if (!Object.prototype.hasOwnProperty.call(files, fromId)) {
      throw new Error(`File not found: ${fromId}`);
    }
    if (Object.prototype.hasOwnProperty.call(files, toId)) {
      throw new Error(`File already exists: ${toId}`);
    }
    files[toId] = { ...files[fromId], mtime: Date.now() };
    delete files[fromId];
    writeFiles(files);
    notifyWatchers({ id: fromId, dsl: null, type: "unlink" });
    notifyWatchers({ id: toId, dsl: files[toId].content, type: "add" });
  },

  watch(cb) {
    watchers.add(cb);
    return () => watchers.delete(cb);
  },

  capabilities: { readOnly: false, versioning: false },
};

export default browserHost;
