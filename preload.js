const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  closeCaptureWindow: () => ipcRenderer.send("close-capture-window"),

  // 【修正】改回只接收 sourceId，因為不再需要 scaleFactor
  onSetScreenSource: (callback) => {
    ipcRenderer.on("SET_SCREEN_SOURCE", (event, sourceId) =>
      callback(sourceId)
    );
  },

  sendSelectionComplete: (imageData) => {
    ipcRenderer.send("selection-complete", imageData);
  },
});
