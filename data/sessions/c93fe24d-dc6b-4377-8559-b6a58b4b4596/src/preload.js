const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendTask: (task) => ipcRenderer.send('task', task),
    receiveTasks: (callback) => ipcRenderer.on('tasks', (event, tasks) => callback(tasks))
});
