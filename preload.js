const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  closeCaptureWindow: () => ipcRenderer.send("close-capture-window"),

  onSetScreenSource: (callback) => {
    ipcRenderer.on("SET_SCREEN_SOURCE", (event, sourceId) =>
      callback(sourceId)
    );
  },

  sendSelectionComplete: (imageData) => {
    ipcRenderer.send("selection-complete", imageData);
  },

  // Vision API results
  onVisionResult: (callback) => {
    ipcRenderer.on("update-vision-result", (event, text) => callback(text));
  },
});
