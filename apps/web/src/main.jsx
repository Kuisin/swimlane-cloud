import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Download, Upload, Workflow } from "lucide-react";
import "@swimlane-cloud/editor/styles.css";
import { DslEditor } from "@swimlane-cloud/editor";
import { browserHost, resetDemo } from "./browser-host";
import "./app.css";

// Demo mode. `?demo=reset` discards the browser's files and reseeds the
// samples, so a walkthrough — or an end-to-end test — always starts from the
// same place. Everything else about the app is already the demo: no backend,
// no login, files in localStorage.
if (new URLSearchParams(window.location.search).get("demo") === "reset") {
  resetDemo();
  // Clear the editor's own remembered state too (mode, open tabs, widths).
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("sw-editor:")) localStorage.removeItem(key);
  }
}

// A compact top bar above <DslEditor> providing Import / Export affordances.
// The editor owns its own actions; we add only what the browser host needs:
// importing local .txt files and a "download all" escape hatch.
function App() {
  const fileInputRef = useRef(null);
  // Bump to force <DslEditor> to re-list after an import mutates storage.
  const [editorKey, setEditorKey] = useState(0);

  async function handleImport(event) {
    const files = Array.from(event.target.files ?? []);
    for (const file of files) {
      const text = await file.text();
      // Import into the root using the file's name as the relative id.
      await browserHost.create(file.name, text);
    }
    event.target.value = "";
    if (files.length) setEditorKey((k) => k + 1);
  }

  async function handleDownloadAll() {
    const refs = await browserHost.list();
    const realFiles = refs.filter((r) => r.name !== ".keep");
    for (const ref of realFiles) {
      const content = await browserHost.read(ref.id);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Flatten nested paths to a safe single filename for the download.
      a.download = ref.id.replace(/\//g, "__");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div className="web-shell">
      <header className="web-topbar">
        <span className="web-topbar__title">
          <Workflow size={16} className="web-topbar__logo" />
          Swimlane Editor
        </span>
        <span className="web-topbar__spacer" />
        <button
          type="button"
          className="web-topbar__btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={14} /> Import
        </button>
        <button type="button" className="web-topbar__btn" onClick={handleDownloadAll}>
          <Download size={14} /> Download all
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          multiple
          hidden
          onChange={handleImport}
        />
      </header>
      <div className="web-editor">
        <DslEditor key={editorKey} host={browserHost} />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
