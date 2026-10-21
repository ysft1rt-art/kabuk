const { app, BrowserWindow, ipcMain, clipboard, shell, nativeTheme, dialog, screen, Notification } = require('electron');
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

// Ana sürecin kendi yazıları (klasör seçme pencereleri, uyarılar). Dil renderer'dan gelir (settings:apply)
let lang = 'tr';
const MAIN_EN = {
  'Başlangıç klasörünü seç': 'Choose start folder',
  'Kabuk programını seç': 'Choose shell program',
  'Programlar': 'Programs',
  'Tüm dosyalar': 'All files',
  '"{cwd}" klasörü bulunamadı, kullanıcı klasöründe açıldı.': 'Folder "{cwd}" was not found; opened in your user folder instead.',
  '"{name}" başlatılamadı ({file}). {fallback} açıldı.': 'Could not start "{name}" ({file}). Opened {fallback} instead.',
  'Kabuk ile aç': 'Open in Kabuk',
};
function mt(text, vars = {}) {
  const s = lang === 'en' && MAIN_EN[text] ? MAIN_EN[text] : text;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

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

// Kurulum dosyasıyla kurulan Kabuk'ta uygulama app.asar paketinin içindedir; Windows'un kendisinin okuduğu
// dosyalar (simgeler, sağ tık menüsü) paketin dışında, Kabuk.exe'nin yanında durur (package.json > extraFiles)
const ROOT = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const asset = (name) => path.join(ROOT, name);

// ---------- Sağ tık menüsü ve kurulu yapay zekâ araçları (contextmenu/menu.js) ----------
const menu = require('./contextmenu/menu');

// ---------- "Kabuk ile aç": klasör ve çalıştırılacak araç ----------
// Sağ tık menüsü Kabuk'u şöyle başlatır: electron.exe "<kabuk>" [--kabuk-run=claude] "--kabuk-dir=<klasör>"
function cleanLaunch(req) {
  if (!req || typeof req !== 'object') return null;
  let dir = typeof req.dir === 'string' ? req.dir : null;
  let run = typeof req.run === 'string' ? req.run : null;
  if (dir) {
    // Eski menüde "C:\" tırnağı kaçırır ve sona " kalır; onu temizle
    dir = dir.replace(/"+$/, '');
    if (/^[A-Za-z]:$/.test(dir)) dir += '\\';
  }
  // Yalnızca listedeki araçlar çalıştırılır (komut satırından rastgele komut gelmesin)
  if (run && !menu.readCliList().some((c) => c.cmd === run)) run = null;
  return dir || run ? { dir, run } : null;
}

function parseLaunch(argv) {
  const req = {};
  for (const a of argv) {
    if (a.startsWith('--kabuk-dir=')) req.dir = a.slice('--kabuk-dir='.length);
    else if (a.startsWith('--kabuk-run=')) req.run = a.slice('--kabuk-run='.length);
  }
  return cleanLaunch(req);
}

// İlk açılışın isteği: renderer hazır olunca alır (launch:take)
let initialLaunch = parseLaunch(process.argv);

// Kabuk tek pencerede çalışır: zaten açıkken tekrar başlatılırsa (sağ tık menüsü, masaüstü kısayolu)
// yeni pencere açılmaz, açık pencerede yeni sekme açılır. Ayarlar da iki kopya arasında bozulmaz
const gotLock = app.requestSingleInstanceLock(initialLaunch || {});
if (!gotLock) app.quit();

app.on('second-instance', (_e, argv, _cwd, data) => {
  if (!win) return;
  const req = cleanLaunch(data) || parseLaunch(argv);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('open:request', req || {});
});

// ---------- Sağ tık menüsü kurulumu (contextmenu/menu.js) ----------
let menuStatus = { state: HEADLESS ? 'off' : 'working', clis: [] };
let menuWanted = null;              // ayarlardaki son değer
let menuQueue = Promise.resolve();  // kurulumlar sırayla (aynı anda iki PowerShell kurulumu olmasın)
const menuCtx = () => ({
  appDir: ROOT,
  exe: process.execPath,
  label: mt('Kabuk ile aç'),
  readState,
  writeState,
});

function sendMenuStatus() {
  if (win && !win.isDestroyed()) win.webContents.send('menu:status', menuStatus);
}

// Bu bilgisayarda kurulum dosyasıyla kurulmuş bir Kabuk varsa, geliştirme klasöründen açılan Kabuk
// sağ tık menüsüne dokunmaz (menü kurulu Kabuk'u açsın; ikisi sırayla birbirinin üstüne yazmasın).
// Kurulu Kabuk her açılışta yerini window-state.json'a yazar (ayarlar klasörü ikisinde aynı)
function installedElsewhere() {
  if (app.isPackaged) return false;
  const exe = readState().installedExe;
  try { return !!exe && fs.statSync(exe).isFile(); } catch { return false; }
}

function syncMenu() {
  const run = async () => {
    if (HEADLESS || process.platform !== 'win32') {
      menuStatus = { state: 'off', clis: menu.detectClis().map((c) => c.name) };
    } else if (installedElsewhere()) {
      menuStatus = { state: 'installed', clis: menu.detectClis().map((c) => c.name) };
    } else {
      menuStatus = { ...menuStatus, state: 'working' };
      sendMenuStatus();
      try { menuStatus = await menu.sync(menuCtx(), menuWanted); } catch (err) { menuStatus = { state: 'error', clis: [], error: String(err) }; }
    }
    sendMenuStatus();
  };
  menuQueue = menuQueue.then(run, run);
  return menuQueue;
}

// Ayar değişince (ve açılıştan birkaç saniye sonra bir kez) menüyü kur/kaldır
let menuStarted = false;
function wantContextMenu(want) {
  if (menuWanted === want) return;
  menuWanted = want;
  if (menuStarted) syncMenu();
}
function menuStartupDone() {
  if (menuStarted) return;
  menuStarted = true;
  if (menuWanted !== null) syncMenu();
}

// "Windows 11 menüsüne ekle" düğmesi: yönetici onayıyla sertifikaya güven, sonra menüyü yeniden kur
ipcMain.handle('menu:trust', async () => {
  if (HEADLESS) return 'canceled';
  const r = await menu.trust();
  if (r === 'done') await syncMenu();
  return r;
});

// ---------- Windows kimliği ve kısayollar ----------
// Windows bildirimleri yalnızca Başlat menüsünde aynı kimlikle (AppUserModelID) bir kısayolu olan
// uygulamalardan gösterilir. Kabuk kurulum programıyla değil electron.exe ile çalıştığı için
// bu kısayolu kendisi oluşturur; masaüstündeki Kabuk kısayoluna da aynı kimliği yazar
// (görev çubuğuna sabitlenince açık pencereyle aynı simgede birleşsin)
const AUMID = 'Kabuk';
app.setAppUserModelId(AUMID);

function ensureShortcuts() {
  if (HEADLESS || process.platform !== 'win32' || app.isPackaged) return;
  const link = {
    target: process.execPath,
    args: `"${app.getAppPath()}"`,
    cwd: app.getAppPath(),
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    iconIndex: 0,
    description: 'Kabuk terminali',
    appUserModelId: AUMID,
  };
  const startMenu = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Kabuk.lnk');
  // Başlat menüsündeki kısayol kurulu Kabuk'unsa (Kabuk.exe) dokunma
  let other = false;
  try { other = path.resolve(shell.readShortcutLink(startMenu).target) !== path.resolve(process.execPath); } catch {}
  if (!other) try { shell.writeShortcutLink(startMenu, fs.existsSync(startMenu) ? 'replace' : 'create', link); } catch {}
  // Masaüstü kısayolu yalnızca bu Kabuk'u açıyorsa güncellenir; başka bir şeyi gösteriyorsa dokunulmaz
  const desktop = path.join(app.getPath('desktop'), 'Kabuk.lnk');
  try {
    const cur = shell.readShortcutLink(desktop);
    // Simge yolu da güncellenir (simgeler assets klasörüne taşındı; eski yol artık yok)
    if (path.resolve(cur.target) === path.resolve(process.execPath) &&
        (cur.appUserModelId !== AUMID || path.resolve(cur.icon || '') !== path.resolve(link.icon))) {
      shell.writeShortcutLink(desktop, 'update', { target: cur.target, appUserModelId: AUMID, icon: link.icon, iconIndex: 0 });
    }
  } catch {}
}

function createWindow() {
  const state = readState();
  const startMode = state.startMode || 'normal';
  let bounds = { width: 1200, height: 760 };
  if (startMode === 'remember' && state.bounds && onScreen(state.bounds)) bounds = state.bounds;
  // Pencere, arayüz ilk kez çizilince görünür (ready-to-show); yoksa bir an boş cam pencere görünüyordu
  win = new BrowserWindow({
    show: false,
    ...bounds,
    minWidth: 480,
    minHeight: 300,
    title: 'Kabuk',
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#c0caf5', height: 40 },
    icon: asset('assets/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: HEADLESS,
    },
  });
  win.setMenu(null);
  // Kabuk'un içinde hiçbir zaman başka bir sayfa açılmaz: terminaldeki bağlantılar
  // yalnızca renderer'ın onayıyla ve kullanıcının kendi tarayıcısında açılır (link:open)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('focus', () => win.flashFrame(false));
  const maximize = startMode === 'maximized' || (startMode === 'remember' && state.maximized);
  let shown = false;
  const showWin = () => {
    if (shown || HEADLESS || !win || win.isDestroyed()) return;
    shown = true;
    if (maximize) win.maximize(); else win.show();
  };
  win.once('ready-to-show', showWin);
  setTimeout(showWin, 3000);   // arayüz takılırsa pencere yine de açılsın
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Sağ tık menüsü denetimi (PowerShell) açılışı yavaşlatmasın: ilk terminal açıldıktan sonra
  win.webContents.once('did-finish-load', () => setTimeout(menuStartupDone, 3000));
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
    dropWarm();
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
  if (['tr', 'en'].includes(s.lang)) lang = s.lang;
  if (['normal', 'maximized', 'remember'].includes(s.startMode)) writeState({ startMode: s.startMode });
  if (typeof s.contextMenu === 'boolean') wantContextMenu(s.contextMenu);
  if (typeof s.autoUpdate === 'boolean') updater.setAuto(s.autoUpdate && !HEADLESS);
  // Bir sonraki açılışta ilk terminal pencereyle birlikte başlatılsın diye: varsayılan kabuk ve klasör
  if (typeof s.startShell === 'string') {
    const cur = readState().warm || {};
    const cwd = typeof s.startCwd === 'string' ? s.startCwd : '';
    if (cur.shellId !== s.startShell || cur.cwd !== cwd) writeState({ warm: { ...cur, shellId: s.startShell, cwd } });
  }
});

ipcMain.handle('launch:take', () => { const r = initialLaunch; initialLaunch = null; return r; });
ipcMain.handle('menu:status', () => menuStatus);

ipcMain.handle('paths:get', () => ({ home: os.homedir(), desktop: app.getPath('desktop') }));

ipcMain.handle('dialog:folder', async (_e, current) => {
  const r = await dialog.showOpenDialog(win, {
    title: mt('Başlangıç klasörünü seç'),
    defaultPath: resolveCwd(current).dir,
    properties: ['openDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:program', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: mt('Kabuk programını seç'),
    defaultPath: 'C:\\Program Files',
    filters: [{ name: mt('Programlar'), extensions: ['exe', 'bat', 'cmd'] }, { name: mt('Tüm dosyalar'), extensions: ['*'] }],
    properties: ['openFile'],
  });
  return r.canceled ? null : r.filePaths[0];
});

// Kabuk, klasör her değiştiğinde (komut istemi her yazıldığında) bulunduğu klasörü görünmez bir
// OSC 9;9 koduyla bildirir; bölünen panel bu klasörde açılır. Ekrandan okumak, bir program çalışırken
// (komut satırı görünmüyorken) işe yaramıyordu. Kullanıcının kendi istemi (profil, oh-my-posh) korunur.
const PS_CWD_HOOK = Buffer.from(
  '$global:__kabukPrompt = $function:prompt; function global:prompt { ' +
  '$l = $executionContext.SessionState.Path.CurrentLocation; $p = & $global:__kabukPrompt; ' +
  'if ($l.Provider.Name -eq "FileSystem") { "$([char]27)]9;9;`"$($l.ProviderPath)`"$([char]7)" + $p } else { $p } }',
  'utf16le').toString('base64');
function shellLaunch(s) {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Kabuk' };
  if (s.custom) return { args: s.args, env };
  if (s.id === 'pwsh' || s.id === 'powershell') return { args: [...s.args, '-NoExit', '-EncodedCommand', PS_CWD_HOOK], env };
  if (s.id === 'cmd' && !process.env.PROMPT) env.PROMPT = '$E]9;9;"$P"$E\\$P$G';
  return { args: s.args, env };
}

// Kabuğu başlatır. Çıktı, sahibi (renderer) belli olana kadar biriktirilir (w.buf)
function spawnShell(s, dir, cols, rows) {
  const { args, env } = shellLaunch(s);
  const p = pty.spawn(s.file, args, {
    name: 'xterm-256color',
    cols: Math.max(cols || 80, 2),
    rows: Math.max(rows || 24, 2),
    cwd: dir,
    env,
    useConptyDll: true,
  });
  const w = { p, shellId: s.id, dir, buf: [], exited: null, onData: null, onExit: null };
  p.onData((d) => (w.onData ? w.onData(d) : w.buf.push(d)));
  p.onExit((e) => { if (w.onExit) w.onExit(e); else w.exited = e; });
  return w;
}

// ---------- Hızlı açılış: ilk terminal pencereyle birlikte başlar ----------
// PowerShell'in açılıp komut istemini yazması yarım saniyeyi bulabiliyor. Kabuk açılır açılmaz, son
// açılıştaki varsayılan kabuk ve klasörle (window-state.json "warm") terminal başlatılır; arayüz ilk
// terminali isteyince bu verilir ve o ana kadar biriken çıktı gönderilir. Kabuk ya da klasör tutmazsa
// (ayar değişmiş) kapatılıp yenisi açılır. 15 sn içinde istenmezse kapatılır.
let warm = null;
function startWarm() {
  const st = readState().warm;
  if (!st || typeof st.shellId !== 'string') return;
  const sh = availableShells().find((s) => s.id === st.shellId);   // özel kabuklar henüz bilinmiyor: atlanır
  if (!sh) return;
  const where = resolveCwd(initialLaunch?.dir || st.cwd || '');
  if (!where.ok) return;
  const num = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  try {
    warm = spawnShell(sh, where.dir, num(st.cols, 2, 1000, 120), num(st.rows, 2, 500, 30));
  } catch { warm = null; return; }
  warm.timer = setTimeout(dropWarm, 15000);
}
function dropWarm() {
  if (!warm) return;
  clearTimeout(warm.timer);
  try { warm.p.kill(); } catch {}
  warm = null;
}
function takeWarm(shellId, dir) {
  const w = warm;
  if (!w) return null;
  warm = null;
  clearTimeout(w.timer);
  if (w.exited || w.shellId !== shellId || path.resolve(w.dir).toLowerCase() !== path.resolve(dir).toLowerCase()) {
    try { w.p.kill(); } catch {}
    return null;
  }
  return w;
}

let firstPty = true;
ipcMain.handle('pty:create', (event, { shellId, cols, rows, cwd }) => {
  const shells = availableShells();
  let sh = shells.find((s) => s.id === shellId) || shells[0];
  const where = resolveCwd(cwd);
  const notes = [];
  if (!where.ok) notes.push(mt('"{cwd}" klasörü bulunamadı, kullanıcı klasöründe açıldı.', { cwd }));
  let w = takeWarm(sh.id, where.dir);
  if (w) {
    try { w.p.resize(Math.max(cols || 80, 2), Math.max(rows || 24, 2)); } catch {}
  } else {
    try {
      w = spawnShell(sh, where.dir, cols, rows);
    } catch (err) {
      // Özel kabuk yanlış yazılmış olabilir: ilk hazır kabukla devam et
      notes.push(mt('"{name}" başlatılamadı ({file}). {fallback} açıldı.', { name: sh.name, file: sh.file, fallback: shells[0].name }));
      sh = shells[0];
      w = spawnShell(sh, where.dir, cols, rows);
    }
  }
  // İlk terminalin boyutu bir sonraki açılışta önceden başlatılan terminal için saklanır
  if (firstPty) {
    firstPty = false;
    const cur = readState().warm || {};
    if (cur.cols !== cols || cur.rows !== rows) writeState({ warm: { ...cur, cols, rows } });
  }
  const id = nextPtyId++;
  ptys.set(id, w.p);
  const send = (data) => event.sender.isDestroyed() || event.sender.send('pty:data', id, data);
  const exit = ({ exitCode }) => {
    ptys.delete(id);
    if (!event.sender.isDestroyed()) event.sender.send('pty:exit', id, exitCode);
  };
  // Biriken çıktı, renderer bu terminalin numarasını öğrendikten sonra (bu cevaptan sonra) sırayla gönderilir
  setImmediate(() => {
    if (w.buf.length) send(w.buf.join(''));
    w.buf = [];
    w.onData = send;
    if (w.exited) exit(w.exited); else w.onExit = exit;
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
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// ---------- Bildirimler ----------
// Renderer, bir program dikkat istediğinde (Claude Code bitti / onay bekliyor) buraya yazar.
// Gösterilen bildirimler kapanana kadar burada tutulur, yoksa çöpe gidip tıklama çalışmaz
const shownNotes = new Set();
ipcMain.on('notify', (_e, { id, title, body, toast, flash }) => {
  if (!win) return;
  if (flash && !win.isFocused()) win.flashFrame(true);
  if (!toast || !Notification.isSupported()) return;
  const note = new Notification({
    title: String(title || 'Kabuk').slice(0, 120),
    body: String(body || '').slice(0, 400),
    icon: asset('assets/icon.png'),
  });
  shownNotes.add(note);
  const forget = () => shownNotes.delete(note);
  note.on('click', () => {
    forget();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('notify:click', id);
  });
  note.on('close', forget);
  note.on('failed', forget);
  note.show();
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

// ---------- Otomatik güncelleme (updater.js) ----------
const { createUpdater } = require('./updater');
const updater = createUpdater({
  send: (s) => { if (win && !win.isDestroyed()) win.webContents.send('update:status', s); },
  // Güncelleme için kapanırken "terminaller açık, kapatılsın mı?" sorusu sorulmaz (renderer zaten sordu)
  beforeInstall: () => { forceClose = true; },
});
ipcMain.handle('update:status', () => updater.status());
ipcMain.handle('update:check', () => updater.check(true));
ipcMain.handle('update:install', () => updater.install());

if (gotLock) app.whenReady().then(() => {
  // Geliştirme klasöründen açılan Kabuk kurulu olanı bulabilsin (installedElsewhere)
  if (app.isPackaged && !HEADLESS) writeState({ installedExe: process.execPath });
  ensureShortcuts();
  startWarm();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
