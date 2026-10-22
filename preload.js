const { contextBridge, ipcRenderer, webUtils } = require('electron');

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
  // Sürükleyip bırakılan dosyanın diskteki yolu (Electron'da File.path artık yok)
  pathForFile: (file) => webUtils.getPathForFile(file),
  openLink: (url) => ipcRenderer.send('link:open', url),
  setChrome: (opts) => ipcRenderer.send('window:chrome', opts),
  closeWindow: (force = false) => ipcRenderer.send('window:close', force),
  onConfirmClose: (cb) => ipcRenderer.on('window:confirmClose', (_e, count) => cb(count)),
  syncSettings: (s) => ipcRenderer.invoke('settings:apply', s),
  getPaths: () => ipcRenderer.invoke('paths:get'),
  // Oturumu hatırlama: data null ise kayıt silinir
  saveSession: (data) => ipcRenderer.sendSync('session:save', data),
  loadSession: () => ipcRenderer.invoke('session:load'),
  sessionSize: () => ipcRenderer.invoke('session:size'),
  pickFolder: (current) => ipcRenderer.invoke('dialog:folder', current),
  pickProgram: () => ipcRenderer.invoke('dialog:program'),
  notify: (opts) => ipcRenderer.send('notify', opts),
  onNotifyClick: (cb) => ipcRenderer.on('notify:click', (_e, id) => cb(id)),
  // "Kabuk ile aç" (sağ tık menüsü): { dir, run } — ilk açılışta takeLaunch, Kabuk açıkken onOpenRequest
  takeLaunch: () => ipcRenderer.invoke('launch:take'),
  onOpenRequest: (cb) => ipcRenderer.on('open:request', (_e, req) => cb(req)),
  getMenuStatus: () => ipcRenderer.invoke('menu:status'),
  onMenuStatus: (cb) => ipcRenderer.on('menu:status', (_e, s) => cb(s)),
  trustMenu: () => ipcRenderer.invoke('menu:trust'),
  // Otomatik güncelleme (updater.js): durum, elle kontrol, "yeniden başlat ve güncelle"
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  onUpdateStatus: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
});
