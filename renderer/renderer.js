'use strict';

const api = window.kabuk;
const THEMES = window.KABUK_THEMES;
// FunLayer, FUN_WORDS, PROMPT_RE: fun.js'ten gelir

// ---------- Ayarlar (bu bilgisayarda saklanır) ----------
const DEFAULTS = {
  v: 4,
  theme: 'kar',
  mode: 'light',       // auto (Windows'a uy) / dark / light — bütün temalarda geçerli
  acrylic: false,
  glass: 0.8,          // buzlu camın renk yoğunluğu (0.5 = çok saydam, 0.95 = neredeyse düz)
  pureBlack: true,
  fun: true,           // boş satırda ipucu + animasyonlar
  fontSize: 13,
  fontFamily: 'JetBrains Mono Variable',
  fontWeight: 300,
  shell: null,
  // Başlangıç
  startDir: 'home',    // home / desktop / custom
  customDir: '',
  splitSameDir: true,  // bölünen panel, bulunduğun klasörde açılır
  startMode: 'normal', // pencere: normal / maximized / remember
  confirmClose: true,
  // Terminal
  cursorStyle: 'bar',
  cursorBlink: true,
  lineHeight: 1.2,
  scrollback: 10000,
  copyOnSelect: false,
  rightClick: true,
  customShells: [],    // { id, name, file, args: [] }
  keys: {},            // değiştirilen kısayollar: { işlem: ['Ctrl+Shift+T', ...] } (keys.js)
};
const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('kabuk.settings') || '{}');
  // Eski sürümden gelen ayarlarda yeni varsayılan yazı tipi/boyut geçerli olsun
  if ((saved.v || 1) < 2) delete saved.fontSize;
  // v4: Klasik tema kaldırıldı; varsayılan Kar (açık)
  if ((saved.v || 1) < 4) { delete saved.theme; delete saved.mode; }
  saved.v = DEFAULTS.v;
  Object.assign(settings, saved);
} catch {}
if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;
if (!settings.keys || typeof settings.keys !== 'object' || Array.isArray(settings.keys)) settings.keys = {};
for (const [k, v] of Object.entries(settings.keys)) {
  if (!Array.isArray(v) || v.some((c) => typeof c !== 'string')) delete settings.keys[k];
}
function saveSettings() {
  try { localStorage.setItem('kabuk.settings', JSON.stringify(settings)); } catch {}
}

// ---------- Yazı tipleri ----------
// Uygulamaya gömülü olanlar her zaman var; sistemdekiler kuruluysa listeye eklenir
const BUNDLED_FONTS = [
  { family: 'JetBrains Mono Variable', name: 'JetBrains Mono' },
  { family: 'Geist Mono Variable', name: 'Geist Mono' },
  { family: 'Fira Code Variable', name: 'Fira Code' },
  { family: 'Source Code Pro Variable', name: 'Source Code Pro' },
];
const SYSTEM_FONTS = [
  'Cascadia Mono', 'Cascadia Code', 'Consolas', 'Lucida Console', 'Courier New',
  'Hack', 'Iosevka', 'IBM Plex Mono', 'Roboto Mono', 'Ubuntu Mono', 'Inconsolata',
  'Victor Mono', 'Fantasque Sans Mono', 'Comic Mono', 'CaskaydiaCove Nerd Font',
  'JetBrainsMono Nerd Font', 'MesloLGS NF', 'Monaspace Neon', 'Commit Mono',
];
let FONTS = [...BUNDLED_FONTS];

function isFontInstalled(family) {
  const ctx = document.createElement('canvas').getContext('2d');
  const text = 'mmmmmmmmmmlli10OO@#';
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    ctx.font = `40px ${base}`;
    const w0 = ctx.measureText(text).width;
    ctx.font = `40px "${family}", ${base}`;
    return ctx.measureText(text).width !== w0;
  });
}

function detectFonts() {
  FONTS = [...BUNDLED_FONTS, ...SYSTEM_FONTS.filter(isFontInstalled).map((f) => ({ family: f, name: f }))];
  if (!FONTS.some((f) => f.family === settings.fontFamily)) settings.fontFamily = DEFAULTS.fontFamily;
}

const fontStack = () => `"${settings.fontFamily}", "Cascadia Mono", Consolas, monospace`;

async function loadFont() {
  try {
    await document.fonts.load(`${settings.fontWeight} ${settings.fontSize}px "${settings.fontFamily}"`);
    await document.fonts.load(`600 ${settings.fontSize}px "${settings.fontFamily}"`);
  } catch {}
}

// ---------- Durum ----------
const tabs = [];          // { id, el, tabEl, titleEl, badgeEl, root, activePane }
let activeTab = null;
const panesByPty = new Map();
let shells = [];
let paths = { home: '', desktop: '' };
let nextTabId = 1;

const $ = (id) => document.getElementById(id);
const workspace = $('workspace');
const tabsEl = $('tabs');

api.onData((id, data) => panesByPty.get(id)?.term.write(data));
api.onExit((id) => {
  const pane = panesByPty.get(id);
  if (pane) { pane.ptyId = null; closePane(pane); }
});

// ---------- Tema ----------
function withAlpha(hex, a) {
  const v = Math.round(a * 255).toString(16).padStart(2, '0');
  return hex.length === 7 ? hex + v : hex;
}

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
systemDark.addEventListener('change', () => { if (settings.mode === 'auto') applyTheme(); });

const isDark = () => (settings.mode === 'auto' ? systemDark.matches : settings.mode === 'dark');

// Temanın seçili moddaki (koyu/açık) hali
function resolveTheme(key = settings.theme) {
  const th = THEMES[key];
  const dark = isDark();
  return { name: th.name, light: !dark, ...th[dark ? 'dark' : 'light'] };
}

// Seçili temanın arayüz renkleri; "saf siyah" açıksa koyu temalarda zemin kapkara olur
function uiColors() {
  const th = resolveTheme();
  if (!settings.pureBlack || th.light) return th.ui;
  return { ...th.ui, bg: '#000000', tabActive: '#000000', bar: '#0a0a0c', tab: '#141417', border: '#232328' };
}

function termTheme() {
  const th = resolveTheme();
  const ui = uiColors();
  const t = { ...th.term };
  if (settings.pureBlack && !th.light) { t.background = '#000000'; t.cursorAccent = '#000000'; }
  if (settings.acrylic) t.background = '#00000000';
  t.scrollbarSliderBackground = withAlpha(ui.dim, 0.25);
  t.scrollbarSliderHoverBackground = withAlpha(ui.dim, 0.45);
  t.scrollbarSliderActiveBackground = withAlpha(ui.accent, 0.5);
  return t;
}

function applyTheme() {
  const th = resolveTheme();
  const ui = uiColors();
  const a = settings.acrylic;
  const root = document.documentElement.style;
  // Buzlu camda başlık çubuğu ve terminal aynı renkte yarı saydam cam olur;
  // yoğunluk ayarlanabilir, böylece yazılar ve düğmeler her zaman okunur
  const glass = withAlpha(ui.tabActive, settings.glass);
  root.setProperty('--bg', a ? 'transparent' : ui.bg);
  root.setProperty('--bar', a ? glass : ui.bar);
  root.setProperty('--tab', a ? withAlpha(ui.fg, 0.08) : ui.tab);
  root.setProperty('--tab-active', a ? glass : ui.tabActive);
  root.setProperty('--tab-glow', withAlpha(ui.fg, th.light ? 0.07 : 0.1));
  root.setProperty('--popover', ui.bar);
  document.body.classList.toggle('acrylic', a);
  root.setProperty('--fg', ui.fg);
  root.setProperty('--dim', ui.dim);
  root.setProperty('--accent', ui.accent);
  root.setProperty('--border', ui.border);
  document.body.classList.toggle('light', !!th.light);
  forEachPane((p) => { p.term.options.theme = termTheme(); });
  // Windows'un camı ve pencere düğmeleri de temanın moduna uysun
  api.setChrome({ symbolColor: ui.fg, acrylic: a, scheme: settings.mode === 'auto' ? 'system' : settings.mode });
  renderAppearance();
}

function renderFontControls() {
  ui.fontFamily.setOptions(FONTS.map((f) => ({ value: f.family, label: f.name, font: f.family })));
  ui.fontFamily.setValue(settings.fontFamily);
  setSegmented('setFontWeight', String(settings.fontWeight));
  $('fontSizeLabel').textContent = settings.fontSize;
  const prev = $('fontPreview');
  prev.style.fontFamily = fontStack();
  prev.style.fontWeight = settings.fontWeight;
  prev.style.fontSize = settings.fontSize + 'px';
}

async function applyFont() {
  saveSettings();
  renderFontControls();
  await loadFont();
  forEachPane((p) => {
    p.term.options.fontFamily = fontStack();
    p.term.options.fontWeight = settings.fontWeight;
    p.term.options.fontWeightBold = boldWeight();
    p.term.options.fontSize = settings.fontSize;
    p.fitSoon();
  });
}

const boldWeight = () => Math.min(800, Number(settings.fontWeight) + 300);

// Görünüm bölümü: tema listesi (seçili koyu/açık haldeki renk önizlemeleriyle) ve anahtarlar
function renderAppearance() {
  ui.theme.setOptions(Object.keys(THEMES).map((key) => {
    const th = resolveTheme(key);
    const t = th.term;
    return {
      value: key,
      label: th.name,
      group: THEMES[key].group || 'Kabuk temaları',
      swatch: {
        bg: settings.pureBlack && !th.light ? '#000000' : t.background,
        colors: [t.foreground, t.red, t.green, t.yellow, t.blue, t.magenta],
      },
    };
  }));
  ui.theme.setValue(settings.theme);
  setSegmented('setMode', settings.mode);
  ui.pureBlack.setChecked(settings.pureBlack);
  ui.acrylic.setChecked(settings.acrylic);
  ui.fun.setChecked(settings.fun);
  $('glassRow').hidden = !settings.acrylic;
  ui.glass.setValue(settings.glass);
}

function setFontSize(size) {
  settings.fontSize = Math.min(32, Math.max(8, size));
  applyFont();
}

// ---------- Panel (tek bir terminal) ----------
class Pane {
  constructor(tab) {
    this.tab = tab;
    this.parent = null;
    this.ptyId = null;
    this.title = '';
    this.el = document.createElement('div');
    this.el.className = 'pane';
    const host = document.createElement('div');
    host.className = 'term-host';
    this.el.appendChild(host);

    this.term = new Terminal({
      fontFamily: fontStack(),
      fontSize: settings.fontSize,
      fontWeight: settings.fontWeight,
      fontWeightBold: boldWeight(),
      lineHeight: settings.lineHeight,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      cursorInactiveStyle: 'outline',
      allowTransparency: true,
      allowProposedApi: true,
      scrollback: settings.scrollback,
      theme: termTheme(),
    });
    this.fit = new FitAddon.FitAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon.WebLinksAddon((_e, url) => api.openLink(url)));
    this.term.loadAddon(new Unicode11Addon.Unicode11Addon());
    this.term.unicode.activeVersion = '11';
    this.term.open(host);
    this.host = host;

    // Eğlence katmanı + yazılan satırın takibi
    this.fx = new FunLayer(host);
    this.typed = '';
    this.typedAtPrompt = false;

    this.term.attachCustomKeyEventHandler((e) => this.handleKey(e));
    this.term.onData((d) => this.onInput(d));
    this.term.onResize(({ cols, rows }) => { this.ptyId && api.resize(this.ptyId, cols, rows); this.hintSoon(); });
    this.term.onWriteParsed(() => this.hintSoon());
    this.term.onScroll(() => this.hintSoon());
    this.term.onTitleChange((t) => {
      this.title = t;
      if (this.tab) updateTabTitle(this.tab); else renderHidden();
    });

    // Bölünmüş ekranda panelin üzerine gelince sağ üstte beliren kapatma düğmesi
    const actions = document.createElement('div');
    actions.className = 'pane-actions';
    actions.innerHTML = `
      <button class="pane-btn pane-hide" data-key-action="hidePane" data-tip-text="Paneli gizle" data-tip-more=" — kapanmaz, arka planda çalışır"><svg viewBox="0 0 16 16"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/><path d="M3 13L13 3"/></svg></button>
      <button class="pane-btn pane-close" data-key-action="closePane" data-tip-text="Paneli kapat"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>`;
    actions.addEventListener('mousedown', (e) => e.stopPropagation(), true);
    actions.querySelector('.pane-hide').addEventListener('click', (e) => { e.stopPropagation(); hidePane(this); });
    actions.querySelector('.pane-close').addEventListener('click', (e) => { e.stopPropagation(); closePane(this); });
    this.el.appendChild(actions);
    paintKeyTips(actions);

    this.el.addEventListener('mousedown', () => focusPane(this), true);
    this.term.onSelectionChange(() => {
      if (settings.copyOnSelect && this.term.hasSelection()) api.writeClipboard(this.term.getSelection());
    });
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!settings.rightClick) return;
      if (this.term.hasSelection()) {
        api.writeClipboard(this.term.getSelection());
        this.term.clearSelection();
      } else {
        this.paste();
      }
    });

    this._fitQueued = false;
    new ResizeObserver(() => this.fitSoon()).observe(this.el);
  }

  async start(shellId, cwd = startCwd()) {
    this.fitNow();
    const { id, name, shellId: realShell, notes } = await api.createPty({ shellId, cwd, cols: this.term.cols, rows: this.term.rows });
    notes?.forEach((n) => showToast(n));
    this.ptyId = id;
    this.shellName = name;
    this.shellId = realShell;
    panesByPty.set(id, this);
    updateTabTitle(this.tab);
    this.fitNow();
  }

  onInput(d) {
    if (!this.ptyId) return;
    this.fx.hideHint();
    if (!this.trackInput(d)) api.write(this.ptyId, d);
    this.hintSoon();
  }

  // Yazılan satırı takip eder; boş komut satırına eğlence kelimesi yazılıp
  // Enter'a basıldıysa satırı siler, animasyonu oynatır ve true döner
  trackInput(d) {
    if (d === '\r') {
      const word = this.typed.trim().toLocaleLowerCase('tr');
      const scene = settings.fun && this.typedAtPrompt ? FUN_WORDS[word] : null;
      const n = [...this.typed].length;
      this.typed = '';
      this.typedAtPrompt = false;
      if (!scene) return false;
      api.write(this.ptyId, '\x7f'.repeat(n));
      this.fx.play(scene);
      return true;
    }
    if (d === '\x7f' || d === '\b') { this.typed = [...this.typed].slice(0, -1).join(''); return false; }
    if (d === '\x1b' || (d.length === 1 && d < ' ')) { this.typed = ''; this.typedAtPrompt = false; return false; }
    // Kaçış dizileri: ok tuşları veya terminalin Windows'a verdiği otomatik cevaplar.
    // Satır boşken yok say; doluyken satırı artık güvenle takip edemeyiz
    if (d.startsWith('\x1b')) { if (this.typed) this.typedAtPrompt = false; return false; }
    if (/[\r\n]/.test(d)) { this.typedAtPrompt = false; this.typed += ' '; return false; }
    if (this.typed === '') this.typedAtPrompt = this.atEmptyPrompt();
    this.typed += d;
    return false;
  }

  atEmptyPrompt() {
    const b = this.term.buffer.active;
    if (b.type !== 'normal') return false;
    // PowerShell istemin sonuna gerçek bir boşluk yazar; kırpıp bakıyoruz
    const line = (b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? '').trimEnd();
    return b.cursorX >= line.length && PROMPT_RE.test(line);
  }

  hintSoon() {
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.updateHint(), 150);
  }

  updateHint() {
    const b = this.term.buffer.active;
    const show = settings.fun && this.tab?.activePane === this && this.typed === '' &&
      b.viewportY === b.baseY && this.atEmptyPrompt();
    const screen = this.host.querySelector('.xterm-screen');
    if (!show || !screen) { this.fx.hideHint(); return; }
    const cw = screen.clientWidth / this.term.cols;
    const ch = screen.clientHeight / this.term.rows;
    const x = screen.offsetLeft + (b.cursorX + 1) * cw;
    const y = screen.offsetTop + b.cursorY * ch;
    this.fx.showHint(x, y, ch, `italic ${settings.fontWeight} ${settings.fontSize}px ${fontStack()}`, this.host.clientWidth - x - 36);
  }

  handleKey(e) {
    if (e.type !== 'keydown') return true;
    const k = e.key.toLowerCase();
    // Ctrl+C: seçim varsa kopyala
    if (e.ctrlKey && !e.shiftKey && !e.altKey && k === 'c' && this.term.hasSelection()) {
      api.writeClipboard(this.term.getSelection());
      this.term.clearSelection();
      return false;
    }
    // Yapıştır / kopyala kısayolları (Ctrl+V, Ctrl+Shift+C...) kısayol sisteminde (keys.js)
    // Shift+Enter: Claude Code'da yeni satır
    if (e.shiftKey && !e.ctrlKey && !e.altKey && e.key === 'Enter') {
      if (this.ptyId) api.write(this.ptyId, '\x1b\r');
      return false;
    }
    return true;
  }

  async paste() {
    const text = await api.readClipboard();
    if (text) this.term.paste(text);
  }

  // Gizliyken DOM dışındaydı; geri gelince boyutla ve yeniden çiz
  reattached() {
    requestAnimationFrame(() => {
      this.fitNow();
      this.term.refresh(0, this.term.rows - 1);
      this.term.focus();
    });
  }

  fitNow() {
    if (!this.el.offsetWidth || !this.el.offsetHeight) return;
    try { this.fit.fit(); } catch {}
    this.hintSoon();
  }

  fitSoon() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => { this._fitQueued = false; this.fitNow(); });
  }

  dispose() {
    if (this.ptyId) { panesByPty.delete(this.ptyId); api.kill(this.ptyId); this.ptyId = null; }
    this.term.dispose();
  }
}

// ---------- Bölme düğümü (iki çocuk + sürüklenebilir ayraç) ----------
class Split {
  constructor(dir, a, b) {
    this.dir = dir;       // 'row' = yan yana, 'column' = alt alta
    this.a = a;
    this.b = b;
    this.ratio = 0.5;
    this.parent = null;
    this.el = document.createElement('div');
    this.el.className = 'split ' + dir;
    this.divider = document.createElement('div');
    this.divider.className = 'divider';
    this.divider.addEventListener('mousedown', (e) => this.startDrag(e));
    this.divider.addEventListener('dblclick', () => { this.ratio = 0.5; this.layout(); });
  }

  mount() {
    this.el.replaceChildren(this.a.el, this.divider, this.b.el);
    this.a.parent = this;
    this.b.parent = this;
    this.layout();
  }

  layout() {
    this.a.el.style.flex = `${this.ratio} 1 0px`;
    this.b.el.style.flex = `${1 - this.ratio} 1 0px`;
  }

  startDrag(e) {
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    this.divider.classList.add('dragging');
    const move = (ev) => {
      const r = this.dir === 'row'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      this.ratio = Math.min(0.9, Math.max(0.1, r));
      this.layout();
    };
    const up = () => {
      this.divider.classList.remove('dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  replaceChild(oldNode, newNode) {
    if (this.a === oldNode) this.a = newNode; else this.b = newNode;
    newNode.parent = this;
    oldNode.el.replaceWith(newNode.el);
    this.layout();
  }
}

// ---------- Ağaç yardımcıları ----------
function leaves(node) {
  if (!node) return [];
  return node instanceof Pane ? [node] : [...leaves(node.a), ...leaves(node.b)];
}
// Gizli paneller de dahil: tema/ayar değişikliği geri açıldıklarında da geçerli olsun
function forEachPane(fn) { for (const t of tabs) leaves(t.root).forEach(fn); hiddenPanes.forEach(fn); }

function replaceNode(oldNode, newNode) {
  const parent = oldNode.parent;
  if (parent instanceof Split) {
    parent.replaceChild(oldNode, newNode);
  } else {
    const tab = parent;
    tab.root = newNode;
    newNode.parent = tab;
    // Bölmeden kalan genişlik oranını sil, yoksa tek kalan panel yarım ekranda kalır
    newNode.el.style.flex = '';
    oldNode.el.replaceWith(newNode.el);
  }
}

// ---------- Sekmeler ----------
// Sekme çubuğunda bir sekme + altında boş içerik alanı oluşturur
function makeTab(icon = '') {
  const tab = { id: nextTabId++, root: null, activePane: null };
  tab.el = document.createElement('div');
  tab.el.className = 'tab-content';
  workspace.appendChild(tab.el);

  tab.tabEl = document.createElement('div');
  tab.tabEl.className = 'tab';
  tab.tabEl.innerHTML = `${icon}<span class="tab-title"></span><span class="tab-badge" hidden></span>
    <button class="tab-close" data-tip="Sekmeyi kapat"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>`;
  tab.titleEl = tab.tabEl.querySelector('.tab-title');
  tab.badgeEl = tab.tabEl.querySelector('.tab-badge');
  tab.tabEl.addEventListener('mousedown', (e) => {
    if (e.button === 1) { e.preventDefault(); closeTab(tab); }
    else if (!e.target.closest('.tab-close')) activateTab(tab);
  });
  tab.tabEl.querySelector('.tab-close').addEventListener('click', () => closeTab(tab));
  tabsEl.appendChild(tab.tabEl);
  tabs.push(tab);
  return tab;
}

async function newTab(shellId = settings.shell, existingPane = null) {
  const tab = makeTab();
  const pane = existingPane || new Pane(tab);
  pane.tab = tab;
  pane.el.style.flex = '';
  tab.root = pane;
  pane.parent = tab;
  tab.el.appendChild(pane.el);
  activateTab(tab);
  focusPane(pane);
  if (existingPane) pane.reattached();
  else await pane.start(shellId);
  return tab;
}

function activateTab(tab) {
  activeTab = tab;
  for (const t of tabs) {
    const on = t === tab;
    t.el.classList.toggle('active', on);
    t.tabEl.classList.toggle('active', on);
  }
  leaves(tab.root).forEach((p) => p.fitSoon());
  (tab.activePane || leaves(tab.root)[0])?.term.focus();
}

function closeTab(tab) {
  const idx = tabs.indexOf(tab);
  if (idx < 0) return;
  leaves(tab.root).forEach((p) => p.dispose());
  if (tab === settingsTab) {
    settingsPage.hidden = true;
    document.body.appendChild(settingsPage);
    settingsTab = null;
  }
  tab.el.remove();
  tab.tabEl.remove();
  tabs.splice(idx, 1);
  if (!tabs.length) { api.closeWindow(); return; }
  if (activeTab === tab) activateTab(tabs[Math.min(idx, tabs.length - 1)]);
}

function updateTabTitle(tab) {
  const panes = leaves(tab.root);
  const p = tab.activePane || panes[0];
  const title = (p && (p.title || p.shellName)) || 'Terminal';
  tab.titleEl.textContent = title;
  tab.tabEl.dataset.tip = title;
  tab.badgeEl.hidden = panes.length < 2;
  tab.badgeEl.textContent = panes.length;
  tab.el.classList.toggle('multi', panes.length > 1);
}

function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.indexOf(activeTab);
  activateTab(tabs[(i + dir + tabs.length) % tabs.length]);
}

// ---------- Klasörler ----------
// Ayarlardaki başlangıç klasörü (null = kullanıcı klasörü)
function startCwd() {
  if (settings.startDir === 'desktop') return paths.desktop || null;
  if (settings.startDir === 'custom') return settings.customDir.trim() || null;
  return null;
}

// Panelin o an bulunduğu klasörü komut satırından okur:
// "PS C:\x>" (PowerShell), "C:\x>" (CMD), "ad@pc UCRT64 ~/x" (Git Bash, bir üst satırda)
const BASH_ENV = 'MINGW(?:64|32)|UCRT64|CLANG(?:64|32|ARM64)|MSYS';
function paneCwd(pane) {
  // Git Bash pencere başlığına "UCRT64:/c/Users/x" yazar; en güvenilir kaynak bu
  const t = new RegExp(`^(?:${BASH_ENV}):(.+)$`).exec(pane.title || '');
  if (t) return bashToWindows(t[1].trim());
  const b = pane.term.buffer.active;
  if (b.type !== 'normal') return null;
  let y = b.baseY + b.cursorY;
  for (let n = 0; n < 3 && y >= 0; n++) {
    // Uzun yollar alt satıra taşabilir; satırın başını bul ve birleştir
    let start = y;
    while (start > 0 && b.getLine(start)?.isWrapped) start--;
    let text = '';
    for (let i = start; i <= y; i++) text += b.getLine(i)?.translateToString(i === y) ?? '';
    y = start - 1;
    text = text.trim();
    if (n === 0) {
      const m = /^PS ([A-Za-z]:\\[^>]*)>/.exec(text) || /^([A-Za-z]:\\[^>]*)>/.exec(text);
      if (m) return m[1];
    }
    const g = new RegExp(`\\b(?:${BASH_ENV})\\s+(\\S.*?)(?:\\s+\\(.*\\))?$`).exec(text);
    if (g) return bashToWindows(g[1]);
  }
  return null;
}

function bashToWindows(p) {
  if (p === '~' || p.startsWith('~/')) return paths.home + p.slice(1).replace(/\//g, '\\');
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}` : null;
}

// ---------- Kısa bildirim ----------
function showToast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { t.hidden = true; }, 5000);
}

// ---------- Panel işlemleri ----------
function focusPane(pane) {
  const tab = pane.tab;
  tab.activePane = pane;
  for (const p of leaves(tab.root)) p.el.classList.toggle('focused', p === pane);
  pane.term.focus();
  updateTabTitle(tab);
  for (const p of leaves(tab.root)) p.hintSoon();
}

// before: yeni panel sola/yukarıya açılır (yoksa sağa/aşağıya)
async function splitPane(dir, before = false) {
  const tab = activeTab;
  const pane = tab?.activePane;
  if (!pane) return;
  const cwd = (settings.splitSameDir && paneCwd(pane)) || startCwd();
  const fresh = new Pane(tab);
  const split = before ? new Split(dir, fresh, pane) : new Split(dir, pane, fresh);
  replaceNode(pane, split);
  split.mount();
  focusPane(fresh);
  await fresh.start(pane.shellId || settings.shell, cwd);
  leaves(tab.root).forEach((p) => p.fitSoon());
}

function closePane(pane) {
  if (hiddenPanes.includes(pane)) {
    hiddenPanes.splice(hiddenPanes.indexOf(pane), 1);
    pane.dispose();
    renderHidden();
    return;
  }
  const tab = pane.tab;
  if (!tabs.includes(tab)) return;
  const parent = pane.parent;
  if (!(parent instanceof Split)) { closeTab(tab); return; }
  const sibling = parent.a === pane ? parent.b : parent.a;
  pane.dispose();
  replaceNode(parent, sibling);
  const next = leaves(sibling)[0];
  focusPane(next);
  leaves(tab.root).forEach((p) => p.fitSoon());
}

// ---------- Gizli paneller ----------
// Gizlenen panel kapanmaz: kabuğu arka planda çalışmaya devam eder
const hiddenPanes = [];

function hidePane(pane) {
  const tab = pane.tab;
  if (!tab || !(pane.parent instanceof Split)) return;   // tek panel gizlenmez
  const parent = pane.parent;
  const sibling = parent.a === pane ? parent.b : parent.a;
  replaceNode(parent, sibling);
  pane.el.remove();
  pane.el.classList.remove('focused');
  pane.el.style.flex = '';
  pane.fx.hideHint();
  pane.parent = null;
  pane.tab = null;
  pane.hiddenAt = new Date();
  pane.hiddenFrom = tab.titleEl.textContent;
  hiddenPanes.push(pane);
  focusPane(leaves(sibling)[0]);
  leaves(tab.root).forEach((p) => p.fitSoon());
  renderHidden();
}

function showHiddenPane(pane, where) {
  const i = hiddenPanes.indexOf(pane);
  if (i < 0) return;
  hiddenPanes.splice(i, 1);
  pane.hiddenAt = null;
  closePopovers();
  if (where === 'tab' || !activeTab?.activePane) {
    newTab(null, pane);
  } else {
    const tab = activeTab;
    const target = tab.activePane;
    pane.tab = tab;
    const split = new Split('row', target, pane);
    replaceNode(target, split);
    split.mount();
    focusPane(pane);
    pane.reattached();
    leaves(tab.root).forEach((p) => p.fitSoon());
  }
  renderHidden();
}

function lastLine(pane) {
  const b = pane.term.buffer.active;
  for (let i = b.baseY + b.cursorY; i >= 0; i--) {
    const l = b.getLine(i)?.translateToString(true).trim();
    if (l) return l;
  }
  return '';
}

function renderHidden() {
  const btn = $('hiddenBtn');
  btn.hidden = hiddenPanes.length === 0;
  $('hiddenCount').textContent = hiddenPanes.length;
  const list = $('hiddenList');
  list.innerHTML = '';
  if (!hiddenPanes.length) { closePopovers(); return; }
  for (const p of hiddenPanes) {
    const row = document.createElement('div');
    row.className = 'hidden-item';
    const time = p.hiddenAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    row.innerHTML = `
      <div class="hidden-info">
        <div class="hidden-title"></div>
        <div class="hidden-last"></div>
        <div class="hidden-meta"></div>
      </div>
      <div class="hidden-actions">
        <button class="mini-btn wide" data-act="split" data-tip="Seçili panelin yanında aç">Yanına aç</button>
        <button class="mini-btn wide" data-act="tab" data-tip="Yeni sekmede aç">Sekmede aç</button>
        <button class="mini-btn danger" data-act="close" data-tip="Terminali kapat">×</button>
      </div>`;
    row.querySelector('.hidden-title').textContent = p.title || p.shellName || 'Terminal';
    row.querySelector('.hidden-last').textContent = lastLine(p) || '—';
    row.querySelector('.hidden-meta').textContent = `${time} · ${p.hiddenFrom || ''} sekmesinden`;
    row.querySelector('[data-act="split"]').onclick = () => showHiddenPane(p, 'split');
    row.querySelector('[data-act="tab"]').onclick = () => showHiddenPane(p, 'tab');
    row.querySelector('[data-act="close"]').onclick = () => closePane(p);
    list.appendChild(row);
  }
}

function moveFocus(dx, dy) {
  const tab = activeTab;
  const cur = tab?.activePane;
  if (!cur) return;
  const c = cur.el.getBoundingClientRect();
  const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
  let best = null, bestScore = Infinity;
  for (const p of leaves(tab.root)) {
    if (p === cur) continue;
    const r = p.el.getBoundingClientRect();
    const px = r.left + r.width / 2, py = r.top + r.height / 2;
    const along = (px - cx) * dx + (py - cy) * dy;   // istenen yöndeki mesafe
    if (along <= 0) continue;
    const across = Math.abs((px - cx) * dy) + Math.abs((py - cy) * dx);
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  if (best) focusPane(best);
}

// ---------- Kısayollar ----------
// Hangi tuşun ne yaptığı keys.js'te; burada her işlemin karşılığı var
const KEY_ACTIONS = KabukKeys.ACTIONS;
const RUN = {
  splitDown: () => splitPane('column'),
  splitRight: () => splitPane('row'),
  splitUp: () => splitPane('column', true),
  splitLeft: () => splitPane('row', true),
  focusDown: () => moveFocus(0, 1),
  focusRight: () => moveFocus(1, 0),
  focusUp: () => moveFocus(0, -1),
  focusLeft: () => moveFocus(-1, 0),
  newTab: () => newTab(),
  closePane: () => {
    if (activeTab && activeTab === settingsTab) closeTab(settingsTab);
    else if (activeTab?.activePane) closePane(activeTab.activePane);
  },
  hidePane: () => activeTab?.activePane && hidePane(activeTab.activePane),
  nextTab: () => cycleTab(1),
  prevTab: () => cycleTab(-1),
  settings: () => openSettings(),
  copy: () => {
    const term = activeTab?.activePane?.term;
    if (term?.hasSelection()) api.writeClipboard(term.getSelection());
  },
  paste: () => activeTab?.activePane?.paste(),
  fontUp: () => setFontSize(settings.fontSize + 1),
  fontDown: () => setFontSize(settings.fontSize - 1),
  fontReset: () => setFontSize(DEFAULTS.fontSize),
};
// Basılı tutunca tekrar etsin mi (bölme/sekme açma etmesin, yoksa onlarca panel açılır)
const REPEATS = new Set(['focusDown', 'focusRight', 'focusUp', 'focusLeft', 'nextTab', 'prevTab', 'fontUp', 'fontDown']);

const keysFor = (id) => settings.keys[id] ?? KEY_ACTIONS.find((a) => a.id === id).keys;
let keyMap = new Map();   // 'Alt+ArrowDown' → işlem

function rebuildKeys() {
  keyMap = new Map();
  for (const a of KEY_ACTIONS) for (const c of keysFor(a.id)) if (!keyMap.has(c)) keyMap.set(c, a);
  paintKeyTips(document);
  forEachPane((p) => paintKeyTips(p.el));
  renderHelp();
}

// İpuçlarına güncel kısayolu yaz: data-tip-text="Yeni sekme" → "Yeni sekme (Ctrl+Shift+T)"
function paintKeyTips(root) {
  for (const el of root.querySelectorAll('[data-key-action]')) {
    const k = keysFor(el.dataset.keyAction)[0];
    el.dataset.tip = el.dataset.tipText + (k ? ` (${KabukKeys.label(k)})` : '') + (el.dataset.tipMore || '');
  }
}

window.addEventListener('keydown', (e) => {
  if (KUI.isModalOpen() || recording) return;   // onay penceresi / kısayol kaydı açıkken tuşlar onlara ait
  if (e.key === 'Escape' && closePopovers()) { e.preventDefault(); e.stopPropagation(); return; }
  const combo = KabukKeys.fromEvent(e);
  const action = combo && keyMap.get(combo);
  if (!action) return;
  if (action.term && !e.target.closest?.('.xterm')) return;
  e.preventDefault();
  e.stopPropagation();
  if (!e.repeat || REPEATS.has(action.id)) RUN[action.id]();
}, true);

// Kısayollar penceresi (? düğmesi): güncel tuşlarla oluşturulur
const FIXED_KEYS = {
  text: [
    ['Ctrl+C', 'Seçiliyse kopyala, değilse durdur'],
    ['Sağ tık', 'Kopyala / yapıştır'],
    ['Shift+Enter', 'Yeni satır (Claude Code)'],
  ],
};
function renderHelp() {
  const host = $('helpKeys');
  host.innerHTML = '';
  for (const g of KabukKeys.GROUPS) {
    const box = document.createElement('div');
    box.innerHTML = '<div class="help-group"></div><dl class="shortcuts"></dl>';
    box.firstElementChild.textContent = g.name;
    const dl = box.lastElementChild;
    const rows = KEY_ACTIONS.filter((a) => a.group === g.id && keysFor(a.id).length)
      .map((a) => [keysFor(a.id).map(KabukKeys.label).join('  '), a.name]);
    for (const [k, name] of [...rows, ...(FIXED_KEYS[g.id] || [])]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = name;
      dl.append(dt, dd);
    }
    host.appendChild(box);
  }
}

window.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  setFontSize(settings.fontSize + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

// ---------- Açılır menüler ----------
function closePopovers() {
  let any = KUI.closeMenus();
  for (const p of document.querySelectorAll('.popover:not(.hidden)')) { p.classList.add('hidden'); any = true; }
  document.querySelectorAll('.icon-btn.on, .hidden-chip.on').forEach((b) => b.classList.remove('on'));
  if (any) activeTab?.activePane?.term.focus();
  return any;
}

function togglePopover(panel, button, alignRight) {
  const wasOpen = !panel.classList.contains('hidden');
  closePopovers();
  if (wasOpen) return;
  panel.classList.remove('hidden');
  button.classList.add('on');
  const r = button.getBoundingClientRect();
  if (alignRight) {
    panel.style.left = '';
    panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  } else {
    panel.style.right = '';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8)) + 'px';
  }
}

// Dışarı tıklanınca açılır panelleri kapat. Açılır listeler (ui.js) kendi dış tıklamasını
// kendisi yönetir; onların içine tıklamak burada "dışarısı" sayılmamalı
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.popover, .icon-btn, .hidden-chip, .kmenu, .kselect, .kmodal-back')) return;
  closePopovers();
});

function renderShellMenu() {
  const menu = $('shellMenu');
  menu.innerHTML = '<div class="popover-title">Yeni sekme</div>';
  for (const s of shells) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = s.name + (s.id === settings.shell ? '  ✓' : '');
    b.onclick = () => { closePopovers(); newTab(s.id); };
    menu.appendChild(b);
  }
  const hint = document.createElement('div');
  hint.className = 'popover-title';
  hint.style.marginTop = '10px';
  hint.textContent = 'Varsayılan kabuk';
  menu.appendChild(hint);
  for (const s of shells) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = (s.id === settings.shell ? '● ' : '○ ') + s.name;
    b.onclick = () => { settings.shell = s.id; saveSettings(); renderShellMenu(); if (settingsTab) renderSettings(); };
    menu.appendChild(b);
  }
  const more = document.createElement('button');
  more.className = 'menu-item menu-sep';
  more.textContent = 'Ayarlar…';
  more.onclick = openSettings;
  menu.appendChild(more);
}

$('newTab').onclick = () => newTab();
$('shellMenuBtn').onclick = (e) => { renderShellMenu(); togglePopover($('shellMenu'), e.currentTarget, false); };
$('splitRight').onclick = () => splitPane('row');
$('splitDown').onclick = () => splitPane('column');
$('hiddenBtn').onclick = (e) => { renderHidden(); togglePopover($('hiddenPanel'), e.currentTarget, false); };
$('helpBtn').onclick = (e) => togglePopover($('helpPanel'), e.currentTarget, true);
$('helpEditKeys').onclick = () => openSettings('secKeys');
KUI.scrollbar($('helpScroll'), $('helpPanel'));
$('settingsBtn').onclick = () => openSettings();

// ---------- Ayarlar sekmesi ----------
// Sayfa kapalıyken gizli olarak gövdede bekler (getElementById ile bulunabilsin diye)
const settingsPage = $('settingsPage');
const settingsScroll = $('settingsScroll');
let settingsTab = null;

const GEAR_ICON = `<svg class="tab-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1"/><circle cx="8" cy="8" r="4.3"/></svg>`;

// section: açılınca kaydırılacak bölüm (örn. 'secLook')
function openSettings(section) {
  closePopovers();
  if (!settingsTab) {
    settingsTab = makeTab(GEAR_ICON);
    settingsTab.titleEl.textContent = 'Ayarlar';
    settingsTab.tabEl.dataset.tip = 'Ayarlar';
    settingsTab.el.classList.add('settings-content');
    settingsTab.el.appendChild(settingsPage);
    settingsPage.hidden = false;
  }
  renderSettings();
  activateTab(settingsTab);
  if (section) requestAnimationFrame(() => scrollToSection(section, false));
}

function scrollToSection(id, smooth = true) {
  const sec = $(id);
  settingsScroll.scrollTo({ top: sec.offsetTop - 20, behavior: smooth ? 'smooth' : 'auto' });
}

// Sol menüde, o an ekranda olan bölümü işaretle
function markNav() {
  const secs = [...settingsScroll.querySelectorAll('section')];
  const atEnd = settingsScroll.scrollTop + settingsScroll.clientHeight >= settingsScroll.scrollHeight - 4;
  let cur = secs[0];
  for (const s of secs) if (s.offsetTop - settingsScroll.scrollTop <= 90) cur = s;
  if (atEnd) cur = secs.at(-1);
  for (const b of settingsPage.querySelectorAll('.set-nav [data-sec]')) b.classList.toggle('on', b.dataset.sec === cur.id);
}
for (const b of settingsPage.querySelectorAll('.set-nav [data-sec]')) b.onclick = () => scrollToSection(b.dataset.sec);
settingsScroll.addEventListener('scroll', markNav, { passive: true });
KUI.scrollbar(settingsScroll);

// Chromium'un hazır öğeleri yerine Kabuk'un kendi bileşenleri (ui.js)
const ui = {
  theme: KUI.select($('setTheme'), { width: 240, maxHeight: 460, onChange: (v) => { settings.theme = v; saveSettings(); applyTheme(); } }),
  shell: KUI.select($('setShell'), { width: 220, onChange: (v) => changeSetting('shell', v) }),
  fontFamily: KUI.select($('setFontFamily'), { width: 220, onChange: (v) => { settings.fontFamily = v; applyFont(); } }),
  scrollback: KUI.select($('setScrollback'), {
    width: 160,
    options: [1000, 5000, 10000, 50000].map((n) => ({ value: n, label: n.toLocaleString('tr-TR') + ' satır' })),
    onChange: (v) => changeSetting('scrollback', v),
  }),
  glass: KUI.slider($('setGlass'), {
    min: 0.5, max: 0.95, step: 0.05, value: settings.glass,
    format: (v) => `%${Math.round(v * 100)}`,
    onInput: (v) => { settings.glass = v; saveSettings(); applyTheme(); },
  }),
  lineHeight: KUI.slider($('setLineHeight'), {
    min: 1, max: 1.6, step: 0.05, value: settings.lineHeight,
    format: (v) => v.toFixed(2),
    onInput: (v) => changeSetting('lineHeight', v),
  }),
  pureBlack: KUI.toggle($('setPureBlack'), (on) => { settings.pureBlack = on; saveSettings(); applyTheme(); }),
  acrylic: KUI.toggle($('setAcrylic'), (on) => { settings.acrylic = on; saveSettings(); applyTheme(); }),
  fun: KUI.toggle($('setFun'), (on) => { settings.fun = on; saveSettings(); forEachPane((p) => p.hintSoon()); }),
  splitSameDir: KUI.toggle($('setSplitSameDir'), (on) => changeSetting('splitSameDir', on)),
  confirmClose: KUI.toggle($('setConfirmClose'), (on) => changeSetting('confirmClose', on)),
  cursorBlink: KUI.toggle($('setCursorBlink'), (on) => changeSetting('cursorBlink', on)),
  copyOnSelect: KUI.toggle($('setCopyOnSelect'), (on) => changeSetting('copyOnSelect', on)),
  rightClick: KUI.toggle($('setRightClick'), (on) => changeSetting('rightClick', on)),
};

for (const b of $('setMode').querySelectorAll('[data-v]')) {
  b.onclick = () => { settings.mode = b.dataset.v; saveSettings(); applyTheme(); };
}
for (const b of $('setFontWeight').querySelectorAll('[data-v]')) {
  b.onclick = () => { settings.fontWeight = Number(b.dataset.v); applyFont(); };
}
$('fontUp').onclick = () => setFontSize(settings.fontSize + 1);
$('fontDown').onclick = () => setFontSize(settings.fontSize - 1);

// Ana süreç de bilmeli: özel kabuklar, kapatma onayı, pencere açılış boyutu
async function syncMain() {
  await api.syncSettings({
    customShells: settings.customShells,
    confirmClose: settings.confirmClose,
    startMode: settings.startMode,
  });
  shells = await api.listShells();
  if (!shells.some((s) => s.id === settings.shell)) settings.shell = shells[0]?.id;
}

function setSegmented(id, value) {
  for (const b of $(id).querySelectorAll('[data-v]')) b.classList.toggle('on', b.dataset.v === value);
}

function renderSettings() {
  ui.shell.setOptions(shells.map((s) => ({ value: s.id, label: s.name })));
  ui.shell.setValue(settings.shell);

  setSegmented('setStartDir', settings.startDir);
  const custom = settings.startDir === 'custom';
  $('startDirCustom').hidden = !custom;
  $('startDirFixed').hidden = custom;
  $('startDirFixed').textContent = settings.startDir === 'desktop' ? paths.desktop : paths.home;
  if (document.activeElement !== $('setCustomDir')) $('setCustomDir').value = settings.customDir;

  ui.splitSameDir.setChecked(settings.splitSameDir);
  setSegmented('setStartMode', settings.startMode);
  ui.confirmClose.setChecked(settings.confirmClose);

  setSegmented('setCursorStyle', settings.cursorStyle);
  ui.cursorBlink.setChecked(settings.cursorBlink);
  ui.lineHeight.setValue(settings.lineHeight);
  ui.scrollback.setValue(settings.scrollback);
  ui.copyOnSelect.setChecked(settings.copyOnSelect);
  ui.rightClick.setChecked(settings.rightClick);
  renderKeys();
  requestAnimationFrame(markNav);

  const list = $('shellList');
  list.innerHTML = '';
  for (const s of shells) {
    const row = document.createElement('div');
    row.className = 'set-row shell-row';
    row.innerHTML = `
      <div class="set-label"><div class="set-name"></div><div class="set-desc set-mono"></div></div>
      <span class="set-tag"></span>`;
    row.querySelector('.set-name').textContent = s.name;
    row.querySelector('.set-desc').textContent = s.file;
    const tag = row.querySelector('.set-tag');
    if (s.id === settings.shell) tag.textContent = 'Varsayılan';
    else tag.remove();
    if (s.custom) {
      const del = document.createElement('button');
      del.className = 'set-btn danger small';
      del.textContent = 'Kaldır';
      del.onclick = async () => {
        settings.customShells = settings.customShells.filter((c) => c.id !== s.id);
        saveSettings();
        await syncMain();
        saveSettings();
        renderSettings();
      };
      row.appendChild(del);
    }
    list.appendChild(row);
  }
}

// Ayarı kaydet, terminallere uygula, sayfayı tazele
function changeSetting(key, value) {
  settings[key] = value;
  saveSettings();
  if (['cursorStyle', 'cursorBlink', 'lineHeight', 'scrollback'].includes(key)) {
    forEachPane((p) => { p.term.options[key] = value; p.fitSoon(); });
  }
  if (['confirmClose', 'startMode'].includes(key)) syncMain();
  renderSettings();
}

function bindSegmented(id, key) {
  for (const b of $(id).querySelectorAll('[data-v]')) b.onclick = () => changeSetting(key, b.dataset.v);
}

// "a b "c d"" → ['a', 'b', 'c d']
function splitArgs(str) {
  return [...str.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
}

bindSegmented('setStartDir', 'startDir');
$('setCustomDir').oninput = (e) => { settings.customDir = e.target.value; saveSettings(); };
$('browseDir').onclick = async () => {
  const dir = await api.pickFolder(settings.customDir || paths.home);
  if (dir) { settings.customDir = dir; $('setCustomDir').value = dir; saveSettings(); }
};
bindSegmented('setStartMode', 'startMode');
bindSegmented('setCursorStyle', 'cursorStyle');

$('browseProgram').onclick = async () => {
  const file = await api.pickProgram();
  if (!file) return;
  $('newShellFile').value = file;
  if (!$('newShellName').value.trim()) {
    $('newShellName').value = file.split('\\').pop().replace(/\.(exe|bat|cmd)$/i, '');
  }
};
$('addShell').onclick = async () => {
  const name = $('newShellName').value.trim();
  const file = $('newShellFile').value.trim().replace(/^"(.*)"$/, '$1');
  const err = $('addShellError');
  if (!file) { err.textContent = 'Program yolunu yaz veya Gözat ile seç.'; return; }
  err.textContent = '';
  settings.customShells = [...settings.customShells, {
    id: 'custom-' + Date.now(),
    name: name || file.split('\\').pop(),
    file,
    args: splitArgs($('newShellArgs').value),
  }];
  saveSettings();
  await syncMain();
  for (const id of ['newShellName', 'newShellFile', 'newShellArgs']) $(id).value = '';
  renderSettings();
  showToast(`"${settings.customShells.at(-1).name}" eklendi. Yeni sekme menüsünden açabilirsin.`);
};
$('resetSettings').onclick = async () => {
  const ok = await KUI.confirm({
    title: 'Tüm ayarlar sıfırlansın mı?',
    message: 'Tema, yazı tipi ve diğer bütün ayarlar varsayılana döner. Eklediğin kabuklar da silinir.',
    ok: 'Sıfırla',
    danger: true,
  });
  if (!ok) return;
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, structuredClone(DEFAULTS));
  saveSettings();
  await syncMain();
  saveSettings();
  forEachPane((p) => Object.assign(p.term.options, {
    cursorStyle: settings.cursorStyle, cursorBlink: settings.cursorBlink,
    lineHeight: settings.lineHeight, scrollback: settings.scrollback,
  }));
  applyTheme();
  rebuildKeys();
  await applyFont();
  renderSettings();
  showToast('Ayarlar varsayılana döndü.');
};

// ---------- Ayarlar > Kısayollar ----------
// Bir kısayola tıklanınca "kayıt" başlar: basılan ilk geçerli birleşim o işleme atanır
let recording = null;   // { id, index } — index yoksa (-1) yeni kısayol eklenir
const RESET_ICON = '<svg viewBox="0 0 16 16"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.5h2.5"/></svg>';

function setKeys(id, list) {
  const def = KEY_ACTIONS.find((a) => a.id === id).keys;
  const { [id]: _old, ...rest } = settings.keys;
  settings.keys = list.length === def.length && list.every((c, i) => c === def[i]) ? rest : { ...rest, [id]: list };
  saveSettings();
  rebuildKeys();
}

function chipKeys(combo) {
  return KabukKeys.parts(combo).map((p) => {
    const k = document.createElement('kbd');
    k.textContent = p;
    return k;
  });
}

function renderKeys() {
  const host = $('keyGroups');
  host.innerHTML = '';
  for (const g of KabukKeys.GROUPS) {
    const title = document.createElement('div');
    title.className = 'keys-group';
    title.textContent = g.name;
    const card = document.createElement('div');
    card.className = 'set-card';
    for (const a of KEY_ACTIONS.filter((x) => x.group === g.id)) card.appendChild(keyRow(a));
    host.append(title, card);
  }
}

function keyRow(a) {
  const keys = keysFor(a.id);
  const row = document.createElement('div');
  row.className = 'set-row key-row';
  row.dataset.action = a.id;
  row.innerHTML = `
    <div class="set-label"><div class="set-name"></div><div class="set-desc"></div></div>
    <div class="kbd-list"></div>`;
  row.querySelector('.set-name').textContent = a.name;
  const desc = row.querySelector('.set-desc');
  if (recording?.id === a.id && recording.error) { desc.textContent = recording.error; desc.classList.add('set-error'); }
  else if (a.desc) desc.textContent = a.desc;
  else desc.remove();

  const list = row.querySelector('.kbd-list');
  const recChip = () => {
    const c = document.createElement('span');
    c.className = 'kbd-chip recording';
    c.innerHTML = '<span class="kbd-live">Tuşlara bas…</span><span class="kbd-hint">Esc: vazgeç</span>';
    return c;
  };
  keys.forEach((combo, i) => {
    if (recording?.id === a.id && recording.index === i) { list.appendChild(recChip()); return; }
    const chip = document.createElement('span');
    chip.className = 'kbd-chip';
    const edit = document.createElement('button');
    edit.className = 'kbd-edit';
    edit.dataset.tip = 'Değiştirmek için tıkla';
    edit.append(...chipKeys(combo));
    edit.onclick = () => startRecording(a.id, i);
    const x = document.createElement('button');
    x.className = 'kbd-x';
    x.dataset.tip = 'Bu kısayolu kaldır';
    x.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
    x.onclick = () => { recording = null; setKeys(a.id, keys.filter((c) => c !== combo)); renderKeys(); };
    chip.append(edit, x);
    list.appendChild(chip);
  });
  if (recording?.id === a.id && recording.index === -1) list.appendChild(recChip());
  else {
    const add = document.createElement('button');
    add.className = 'kbd-add';
    add.dataset.tip = keys.length ? 'Bir kısayol daha ekle' : 'Kısayol ata';
    add.innerHTML = '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9"/></svg>';
    if (!keys.length) add.insertAdjacentText('beforeend', 'Ata');
    add.onclick = () => startRecording(a.id, -1);
    list.appendChild(add);
  }
  const reset = document.createElement('button');
  reset.className = 'kbd-reset';
  reset.dataset.tip = 'Varsayılana döndür: ' + (a.keys.map(KabukKeys.label).join(', ') || 'yok');
  reset.innerHTML = RESET_ICON;
  reset.style.visibility = settings.keys[a.id] ? '' : 'hidden';
  reset.onclick = () => { recording = null; setKeys(a.id, a.keys); renderKeys(); };
  list.appendChild(reset);
  return row;
}

function startRecording(id, index) {
  KUI.closeTip();
  recording = { id, index };
  document.activeElement?.blur?.();
  renderKeys();
}

function stopRecording() {
  if (!recording) return;
  recording = null;
  renderKeys();
}

async function assignKey(rec, combo) {
  const owner = KEY_ACTIONS.find((a) => a.id !== rec.id && keysFor(a.id).includes(combo));
  if (owner) {
    const ok = await KUI.confirm({
      title: `${KabukKeys.label(combo)} zaten kullanılıyor`,
      message: `Bu kısayol şu an "${owner.name}" için ayarlı. Buraya aktarılsın mı? "${owner.name}" bu kısayolu kaybeder.`,
      ok: 'Aktar',
    });
    if (!ok) { renderKeys(); return; }
    setKeys(owner.id, keysFor(owner.id).filter((c) => c !== combo));
  }
  const list = [...keysFor(rec.id)];
  if (rec.index >= 0 && rec.index < list.length) list[rec.index] = combo; else list.push(combo);
  setKeys(rec.id, [...new Set(list)]);
  renderKeys();
  // Kaydedilen kısayol listede yanıp sönsün
  const row = $('keyGroups').querySelector(`[data-action="${rec.id}"]`);
  const chip = [...(row?.querySelectorAll('.kbd-chip') || [])][[...new Set(list)].indexOf(combo)];
  chip?.classList.add('saved');
}

// Kayıt sırasında basılan tuşlar terminale/kısayollara gitmez
window.addEventListener('keydown', (e) => {
  if (!recording || KUI.isModalOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) { stopRecording(); return; }
  const combo = KabukKeys.fromEvent(e);
  const live = document.querySelector('.kbd-live');
  if (!combo) { if (live) live.textContent = KabukKeys.heldModifiers(e) + '…'; return; }
  const problem = KabukKeys.problem(combo);
  if (problem) { recording.error = problem; renderKeys(); return; }
  const rec = recording;
  recording = null;
  assignKey(rec, combo);
}, true);
window.addEventListener('keyup', (e) => {
  if (!recording) return;
  e.preventDefault();
  const live = document.querySelector('.kbd-live');
  if (live) live.textContent = KabukKeys.heldModifiers(e) ? KabukKeys.heldModifiers(e) + '…' : 'Tuşlara bas…';
}, true);
// Başka yere tıklamak veya pencereden çıkmak kaydı iptal eder
document.addEventListener('mousedown', (e) => {
  if (recording && !e.target.closest('.kbd-list, .kmodal-back')) stopRecording();
}, true);
window.addEventListener('blur', stopRecording);

$('resetKeys').onclick = async () => {
  recording = null;
  const ok = await KUI.confirm({
    title: 'Kısayollar sıfırlansın mı?',
    message: 'Değiştirdiğin bütün kısayollar varsayılan hallerine döner.',
    ok: 'Sıfırla',
    danger: true,
  });
  if (!ok) return;
  settings.keys = {};
  saveSettings();
  rebuildKeys();
  renderKeys();
  showToast('Kısayollar varsayılana döndü.');
};

// Pencere kapatılırken birden fazla terminal varsa ana süreç sorar
api.onConfirmClose(async (count) => {
  if (KUI.isModalOpen()) return;
  const ok = await KUI.confirm({
    title: `${count} terminal açık`,
    message: 'Hepsi kapatılsın mı? İçlerinde çalışan programlar da kapanır.',
    ok: 'Hepsini kapat',
    danger: true,
  });
  if (ok) api.closeWindow(true);
});

// ---------- Başlat ----------
(async () => {
  paths = await api.getPaths();
  await syncMain();
  detectFonts();
  rebuildKeys();
  applyTheme();
  renderFontControls();
  await loadFont();
  await newTab();
})();
