import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";
import { installShims } from "./bootstrap";
import { onStatus, vscodeDialogs, vscodeHost } from "./vscode-host";
import type { StatusPayload } from "../src/protocol";

// Must run before React mounts: the editor reads localStorage during the first
// render pass of its layout hooks.
installShims();

function StatusBar({ status }: { status: StatusPayload | null }) {
  if (!status) return null;

  const tone = !status.trusted || status.gitProblem ? "warn" : "ok";
  return (
    <div className={`sw-vscode-status sw-vscode-status--${tone}`}>
      {status.branch ? <span className="sw-vscode-branch">{status.branch}</span> : null}
      {status.dirty > 0 ? <span>{status.dirty} uncommitted</span> : <span>clean</span>}
      {status.gitProblem ? <span className="sw-vscode-problem">{status.gitProblem}</span> : null}
      {!status.trusted ? (
        <span className="sw-vscode-problem">Workspace not trusted — git disabled</span>
      ) : null}
    </div>
  );
}

function App() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  useEffect(() => onStatus((s) => setStatus(s as StatusPayload)), []);

  return (
    <div className="sw-vscode-root">
      <StatusBar status={status} />
      <div className="sw-vscode-editor">
        {/*
          `dialogs` is not optional here. In a browser the package's
          window.alert/confirm/prompt defaults are right; in a webview they are
          disabled, and without a replacement New file, New folder, Delete,
          Checkpoint and Flag version all silently do nothing.
        */}
        <DslEditor host={vscodeHost} dialogs={vscodeDialogs} />
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
