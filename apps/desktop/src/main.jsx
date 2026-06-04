import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@swimlane-cloud/editor/styles.css";
import { DslEditor } from "@swimlane-cloud/editor";
import { desktopHost } from "./desktop-host";
import "./app.css";

// Tiny app-level wrapper: the desktop app contributes no editor UI — only an
// empty-state "Open folder" button. Once a folder is open, mount the shared
// editor against the desktop host and start watching the tree for external edits.
function DesktopApp() {
  const [folder, setFolder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    desktopHost
      .root()
      .then((root) => {
        if (active) setFolder(root);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!folder) return;
    window.api?.watchFolder(folder);
    return () => window.api?.stopWatch();
  }, [folder]);

  const openFolder = useCallback(async () => {
    const root = await window.api?.selectFolder();
    if (root) setFolder(root);
  }, []);

  if (loading) {
    return <div className="desktop-empty" />;
  }

  if (!folder) {
    return (
      <div className="desktop-empty">
        <h1>Swimlane Cloud</h1>
        <p>Open a folder of .txt DSL files to start editing.</p>
        <button type="button" onClick={openFolder}>
          Open folder…
        </button>
      </div>
    );
  }

  return <DslEditor host={desktopHost} />;
}

createRoot(document.getElementById("root")).render(<DesktopApp />);
