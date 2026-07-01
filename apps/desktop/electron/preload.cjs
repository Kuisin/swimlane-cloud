const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  readTxtFiles: (folderPath) => ipcRenderer.invoke("read-txt-files", folderPath),
  readFile: (relPath) => ipcRenderer.invoke("read-file", relPath),
  writeTxtFile: (relPath, content) =>
    ipcRenderer.invoke("write-txt-file", relPath, content),
  writeTxtFiles: (updates) => ipcRenderer.invoke("write-txt-files", updates),
  createTxtFile: (relPath, content) =>
    ipcRenderer.invoke("create-txt-file", relPath, content),
  makeDir: (relPath) => ipcRenderer.invoke("make-dir", relPath),
  deleteFile: (relPath) => ipcRenderer.invoke("delete-file", relPath),
  deleteFolder: (relPath) => ipcRenderer.invoke("delete-folder", relPath),
  renameFile: (fromPath, toPath) => ipcRenderer.invoke("rename-file", fromPath, toPath),
  getOpenedFolder: () => ipcRenderer.invoke("get-opened-folder"),
  watchFolder: (folderPath) => ipcRenderer.send("watch-folder", folderPath),
  stopWatch: () => ipcRenderer.send("stop-watch"),
  onFileChanged: (cb) => {
    ipcRenderer.on("file-changed", (_event, data) => cb(data));
  },
  removeFileChangedListener: () => {
    ipcRenderer.removeAllListeners("file-changed");
  },
});
