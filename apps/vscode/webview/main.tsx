import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { installShims } from "./bootstrap";
import { createVscodeHost, onReload, onStatus, vscodeDialogs } from "./vscode-host";
import type { StatusPayload } from "../src/protocol";

// Must run before React mounts: the editor reads localStorage during the first
// render pass of its layout hooks.
installShims();

function StatusBar({ status }: { status: StatusPayload | null }) {
  if (!status) return null;

  const blocked = !status.editable;
  return (
    <div className={`sw-vscode-status sw-vscode-status--${blocked ? "warn" : "ok"}`}>
      {status.branch ? <span className="sw-vscode-branch">{status.branch}</span> : null}
      {status.scope ? <span className="sw-vscode-scope">scope: {status.scope}</span> : null}
      <span>{status.dirty > 0 ? `${status.dirty} uncommitted` : "clean"}</span>
      {blocked ? (
        <span className="sw-vscode-problem">
          Read-only — {status.editableReason ?? "editing is unavailable here"}
        </span>
      ) : null}
      {status.gitProblem ? <span className="sw-vscode-problem">{status.gitProblem}</span> : null}
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  // Bumped when the extension says the file set changed, to remount the editor
  // and make it re-list. The tree is built once at mount, so narrowing the edit
  // scope has no effect otherwise.
  const [generation, setGeneration] = useState(0);

  useEffect(() => onStatus((s) => setStatus(s as StatusPayload)), []);
  useEffect(() => onReload(() => setGeneration((g) => g + 1)), []);

  const readOnly = status ? !status.editable : true;

  // A new host object whenever read-only flips, because the editor reads
  // `capabilities` from the host it was given.
  const host = useMemo(() => createVscodeHost(readOnly), [readOnly]);

  return (
    <div className="sw-vscode-root">
      <StatusBar status={status} />
      <div className="sw-vscode-editor">
        {/*
          `dialogs` is not optional here. In a browser the package's
          window.alert/confirm/prompt defaults are right; in a webview they are
          disabled, and without a replacement New file, New folder, Delete,
          Checkpoint and Flag version all silently do nothing.

          The key remounts the editor when the branch, its editability or the
          edit scope changes, so the file tree reflects the new scope.
        */}
        <DslEditor
          key={`${status?.branch ?? "-"}:${readOnly}:${status?.scope ?? "-"}:${generation}`}
          host={host}
          dialogs={vscodeDialogs}
        />
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
