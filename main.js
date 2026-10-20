const { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('@lydell/node-pty');

let win;
const ptys = new Map();
let nextPtyId = 1;

// Ayarlar sayfasından gelenler (renderer açılışta ve her değişiklikte gönderir)
let customShells = [];
let confirmClose = true;
let forceClose = false;

function availableShells() {
  const list = [];
  const pwsh7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  if (fs.existsSync(pwsh7)) list.push({ id: 'pwsh', name: 'PowerShell 7', file: pwsh7, args: ['-NoLogo'] });
  list.push({ id: 'powershell', name: 'Windows PowerShell', file: 'powershell.exe', args: ['-NoLogo'] });
  list.push({ id: 'cmd', name: 'Komut İstemi', file: 'cmd.exe', args: [] });
  const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (fs.existsSync(gitBash)) list.push({ id: 'gitbash', name: 'Git Bash', file: gitBash, args: ['--login', '-i'] });
  for (const c of customShells) list.push({ id: c.id, name: c.name, file: c.file, args: c.args, custom: true });
  return list;
}

// "%USERPROFILE%\Projeler" ve "~\Projeler" gibi yazımları açar; klasör yoksa kullanıcı klasörüne düşer
function resolveCwd(dir) {
  if (!dir) return { dir: os.homedir(), ok: true };
  const full = dir.trim()
    .replace(/%([^%]+)%/g, (m, v) => process.env[v] ?? m)
    .replace(/^~(?=$|[\\/])/, os.homedir());
  try { if (fs.statSync(full).isDirectory()) return { dir: full, ok: true }; } catch {}
  return { dir: os.homedir(), ok: false };
}

// ---------- Pencere boyutu/konumu (bir sonraki açılış için) ----------
const statePath = () => path.join(app.getPath('userData'), 'window-state.json');
function readState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
function writeState(patch) {
  try { fs.writeFileSync(statePath(), JSON.stringify({ ...readState(), ...patch })); } catch {}
}
// Kaydedilen konum artık bağlı olmayan bir ekrandaysa kullanma
function onScreen(b) {
  return screen.getAllDisplays().some(({ workArea: w }) =>
    b.x < w.x + w.width - 50 && b.x + b.width > w.x + 50 && b.y >= w.y - 10 && b.y < w.y + w.height - 50);
}

// Otomatik testlerde pencere hiç görünmeden, ekran dışında çizilir
const HEADLESS = process.env.KABUK_HEADLESS === '1';

function createWindow() {
  const state = readState();
  const startMode = state.startMode || 'normal';
  let bounds = { width: 1200, height: 760 };
  if (startMode === 'remember' && state.bounds && onScreen(state.bounds)) bounds = state.bounds;
  win = new BrowserWindow({
    show: !HEADLESS,
    ...bounds,
    minWidth: 480,
    minHeight: 300,
    title: 'Kabuk',
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#c0caf5', height: 40 },
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: HEADLESS,
    },
  });
  win.setMenu(null);
  if (!HEADLESS && (startMode === 'maximized' || (startMode === 'remember' && state.maximized))) win.maximize();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('close', (e) => {
    // Birden fazla terminal açıkken yanlışlıkla kapatmaya karşı sor. Soruyu Windows'un
    // kutusu değil, uygulamanın kendi onay penceresi sorar; "kapat" derse forceClose ile döner
    if (confirmClose && ptys.size > 1 && !forceClose && !win.webContents.isCrashed?.()) {
      e.preventDefault();
      win.webContents.send('window:confirmClose', ptys.size);
      return;
    }
    writeState({ bounds: win.getNormalBounds(), maximized: win.isMaximized() });
  });
  win.on('closed', () => {
    for (const p of ptys.values()) { try { p.kill(); } catch {} }
    ptys.clear();
    win = null;
  });
}

ipcMain.handle('shells:list', () => availableShells().map(({ id, name, file, custom }) => ({ id, name, file, custom: !!custom })));

ipcMain.handle('settings:apply', (_e, s) => {
  if (Array.isArray(s.customShells)) {
    customShells = s.customShells
      .filter((c) => c && typeof c.file === 'string' && c.file.trim())
      .map((c) => ({ id: String(c.id), name: String(c.name || c.file), file: c.file.trim(), args: (c.args || []).map(String) }));
  }
  if (typeof s.confirmClose === 'boolean') confirmClose = s.confirmClose;
  if (['normal', 'maximized', 'remember'].includes(s.startMode)) writeState({ startMode: s.startMode });
});

ipcMain.handle('paths:get', () => ({ home: os.homedir(), desktop: app.getPath('desktop') }));

ipcMain.handle('dialog:folder', async (_e, current) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Başlangıç klasörünü seç',
    defaultPath: resolveCwd(current).dir,
    properties: ['openDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:program', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Kabuk programını seç',
    defaultPath: 'C:\\Program Files',
    filters: [{ name: 'Programlar', extensions: ['exe', 'bat', 'cmd'] }, { name: 'Tüm dosyalar', extensions: ['*'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('pty:create', (event, { shellId, cols, rows, cwd }) => {
  const shells = availableShells();
  let sh = shells.find((s) => s.id === shellId) || shells[0];
  const where = resolveCwd(cwd);
  const notes = [];
  if (!where.ok) notes.push(`"${cwd}" klasörü bulunamadı, kullanıcı klasöründe açıldı.`);
  const spawn = (s) => pty.spawn(s.file, s.args, {
    name: 'xterm-256color',
    cols: Math.max(cols || 80, 2),
    rows: Math.max(rows || 24, 2),
    cwd: where.dir,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Kabuk' },
    useConptyDll: true,
  });
  let p;
  try {
    p = spawn(sh);
  } catch (err) {
    // Özel kabuk yanlış yazılmış olabilir: ilk hazır kabukla devam et
    notes.push(`"${sh.name}" başlatılamadı (${sh.file}). ${shells[0].name} açıldı.`);
    sh = shells[0];
    p = spawn(sh);
  }
  const id = nextPtyId++;
  ptys.set(id, p);
  p.onData((data) => event.sender.isDestroyed() || event.sender.send('pty:data', id, data));
  p.onExit(({ exitCode }) => {
    ptys.delete(id);
    if (!event.sender.isDestroyed()) event.sender.send('pty:exit', id, exitCode);
  });
  return { id, name: sh.name, shellId: sh.id, notes };
});

ipcMain.on('pty:write', (_e, id, data) => ptys.get(id)?.write(data));
ipcMain.on('pty:resize', (_e, id, cols, rows) => {
  const p = ptys.get(id);
  if (p && cols > 1 && rows > 1) {
    try { p.resize(cols, rows); } catch {}
  }
});
ipcMain.on('pty:kill', (_e, id) => {
  const p = ptys.get(id);
  if (p) { ptys.delete(id); p.kill(); }
});

ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.on('clipboard:write', (_e, text) => clipboard.writeText(String(text)));

ipcMain.on('link:open', (_e, url) => {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
});

ipcMain.on('window:chrome', (_e, { symbolColor, acrylic, scheme }) => {
  if (!win) return;
  // Buzlu camın rengi Windows'un koyu/açık ayarından gelir; temanın moduna eşitle
  if (['system', 'dark', 'light'].includes(scheme)) nativeTheme.themeSource = scheme;
  try { win.setTitleBarOverlay({ color: '#00000000', symbolColor, height: 40 }); } catch {}
  try { win.setBackgroundMaterial(acrylic ? 'acrylic' : 'none'); } catch {}
});

ipcMain.on('window:close', (_e, force) => {
  if (force) forceClose = true;
  win?.close();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
