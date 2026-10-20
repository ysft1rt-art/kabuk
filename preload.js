const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kabuk', {
  listShells: () => ipcRenderer.invoke('shells:list'),
  createPty: (opts) => ipcRenderer.invoke('pty:create', opts),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.send('pty:kill', id),
  onData: (cb) => ipcRenderer.on('pty:data', (_e, id, data) => cb(id, data)),
  onExit: (cb) => ipcRenderer.on('pty:exit', (_e, id, code) => cb(id, code)),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),
  openLink: (url) => ipcRenderer.send('link:open', url),
  setChrome: (opts) => ipcRenderer.send('window:chrome', opts),
  closeWindow: (force = false) => ipcRenderer.send('window:close', force),
  onConfirmClose: (cb) => ipcRenderer.on('window:confirmClose', (_e, count) => cb(count)),
  syncSettings: (s) => ipcRenderer.invoke('settings:apply', s),
  getPaths: () => ipcRenderer.invoke('paths:get'),
  pickFolder: (current) => ipcRenderer.invoke('dialog:folder', current),
  pickProgram: () => ipcRenderer.invoke('dialog:program'),
  notify: (opts) => ipcRenderer.send('notify', opts),
  onNotifyClick: (cb) => ipcRenderer.on('notify:click', (_e, id) => cb(id)),
});
