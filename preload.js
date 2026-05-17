const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:     () => ipcRenderer.send('win:minimize'),
  maximize:     () => ipcRenderer.send('win:maximize'),
  close:        () => ipcRenderer.send('win:close'),
  setTheme:     (theme) => ipcRenderer.send('win:set-theme', theme),
  authComplete:   () => ipcRenderer.send('auth:complete'),
  openExternal:   (url) => ipcRenderer.send('shell:open', url),
  listEmoji:    () => ipcRenderer.invoke('emoji:list'),
});
