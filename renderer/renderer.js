'use strict';

const api = window.kabuk;
const THEMES = window.KABUK_THEMES;
// FunLayer, funScene, PROMPT_RE: fun.js'ten gelir

// ---------- Ayarlar (bu bilgisayarda saklanır) ----------
const DEFAULTS = {
  v: 6,
  lang: null,          // tr / en; boşsa Windows'un diline göre seçilir (i18n.js)
  theme: 'kar',
  mode: 'auto',        // auto (Windows'a uy) / dark / light — bütün temalarda geçerli
  acrylic: true,       // buzlu cam
  glass: 0.8,          // buzlu camın renk yoğunluğu (0.5 = çok saydam, 0.95 = neredeyse düz)
  pureBlack: true,
  fun: true,           // boş satırda ipucu + animasyonlar
  tips: true,          // yeni terminalde boş satırda akan komut önerileri
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
  // Bildirimler: bir program dikkat istediğinde (Claude Code bitti / onay bekliyor)
  notify: true,
  notifyToast: true,   // Windows bildirimi
  notifyFlash: true,   // görev çubuğunda yanıp sön
  notifyBell: true,    // zil sinyali (BEL) de sayılsın
};
const settings = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem('kabuk.settings') || '{}');
  // Eski sürümden gelen ayarlarda yeni varsayılan yazı tipi/boyut geçerli olsun
  if ((saved.v || 1) < 2) delete saved.fontSize;
  // v4: Klasik tema kaldırıldı; varsayılan Kar (açık)
  if ((saved.v || 1) < 4) { delete saved.theme; delete saved.mode; }
  // v5: Eğlence modu artık varsayılan olarak kapalı
  if ((saved.v || 1) < 5) delete saved.fun;
  // v6: Yeni varsayılanlar: tema modu Otomatik, buzlu cam açık (%80), eğlence modu ve öneriler açık
  if ((saved.v || 1) < 6) for (const k of ['mode', 'acrylic', 'glass', 'fun', 'tips']) delete saved[k];
  saved.v = DEFAULTS.v;
  Object.assign(settings, saved);
} catch {}
if (!THEMES[settings.theme]) settings.theme = DEFAULTS.theme;
const systemLang = () => ((navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en');
if (!['tr', 'en'].includes(settings.lang)) settings.lang = systemLang();
LANG = settings.lang;
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
let nextPaneId = 1;

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
  const tt = { ...th.term };
  if (settings.pureBlack && !th.light) { tt.background = '#000000'; tt.cursorAccent = '#000000'; }
  if (settings.acrylic) tt.background = '#00000000';
  tt.scrollbarSliderBackground = withAlpha(ui.dim, 0.25);
  tt.scrollbarSliderHoverBackground = withAlpha(ui.dim, 0.45);
  tt.scrollbarSliderActiveBackground = withAlpha(ui.accent, 0.5);
  return tt;
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
  // Saydamlık yalnızca buzlu camda: kapalıyken harfler zemin rengine göre çizilir, daha keskin ve koyu görünür
  forEachPane((p) => { p.term.options.allowTransparency = a; p.term.options.theme = termTheme(); });
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
    const term = th.term;
    return {
      value: key,
      label: THEMES[key].group ? th.name : t(th.name),
      group: t(THEMES[key].group || 'Kabuk temaları'),
      swatch: {
        bg: settings.pureBlack && !th.light ? '#000000' : term.background,
        colors: [term.foreground, term.red, term.green, term.yellow, term.blue, term.magenta],
      },
    };
  }));
  ui.theme.setValue(settings.theme);
  setSegmented('setMode', settings.mode);
  setSegmented('setLang', settings.lang);
  ui.pureBlack.setChecked(settings.pureBlack);
  ui.acrylic.setChecked(settings.acrylic);
  ui.fun.setChecked(settings.fun);
  ui.tips.setChecked(settings.tips);
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
    this.id = nextPaneId++;
    this.ptyId = null;
    this.title = '';
    this.attention = false;   // bildirim geldi, kullanıcı henüz bakmadı
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
      allowTransparency: settings.acrylic,
      allowProposedApi: true,
      scrollback: settings.scrollback,
      theme: termTheme(),
      // Programların yazdığı tıklanabilir bağlantılar (OSC 8): görünen yazı ile gerçek adres farklı olabilir,
      // bu yüzden adres gösterilip sorulur ve kullanıcının tarayıcısında açılır. xterm'in kendi hali
      // Chromium'un confirm() kutusunu ve Kabuk'un içinde yeni pencere açmayı kullanıyordu
      linkHandler: { activate: (_e, uri) => confirmLink(uri), allowNonHttpProtocols: false },
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
    this.typedOk = true;   // false: ok tuşu vb. yüzünden satırı artık doğru takip edemiyoruz
    this.held = null;      // Enter tutulurken gelen tuşlar
    this.everTyped = false; // ilk gerçek komut çalışınca komut önerileri bu panelde bir daha çıkmaz
                            // (eğlence kelimeleri ve yazıp silmek sayılmaz)

    this.term.attachCustomKeyEventHandler((e) => this.handleKey(e));
    this.term.onData((d) => this.onInput(d));
    this.term.onResize(({ cols, rows }) => { this.ptyId && api.resize(this.ptyId, cols, rows); this.hintSoon(); });
    this.term.onWriteParsed(() => this.hintSoon());
    this.term.onScroll(() => this.hintSoon());
    // Bildirim sinyalleri: zil (BEL), OSC 9 (iTerm2 / Codex), OSC 777;notify (Ghostty biçimi, Claude Code)
    this.term.onBell(() => attend(this, { bell: true }));
    this.term.parser.registerOscHandler(9, (d) => {
      if (/^\d+(;|$)/.test(d)) return false;   // ConEmu komutları (9;4 ilerleme çubuğu, 9;9 klasör) bildirim değil
      attend(this, { body: d });
      return true;
    });
    this.term.parser.registerOscHandler(777, (d) => {
      if (!d.startsWith('notify;')) return false;
      const [, title, ...body] = d.split(';');
      attend(this, { title, body: body.join(';') });
      return true;
    });
    this.term.onTitleChange((title) => {
      this.title = title;
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

  // Ekran kartıyla (WebGL) çizim. Blok karakterleri (█ ▐ ▛ ▜) yazı tipinden değil kendisi çizer;
  // böylece Claude Code'un maskotu ve çerçeveler satır aralığı ne olursa olsun boşluksuz görünür.
  // Açıp kapatmayı syncRenderers yapar. Bağlam kaybolursa (sürücü sorunu) bu panel normal çizimde kalır
  setWebgl(on) {
    if (on && !this.gl && !this.glFailed) {
      try {
        const gl = new WebglAddon.WebglAddon();
        gl.onContextLoss(() => { this.glFailed = true; this.setWebgl(false); });
        this.term.loadAddon(gl);
        this.gl = gl;
      } catch {
        this.glFailed = true;
      }
    } else if (!on && this.gl) {
      const gl = this.gl;
      this.gl = null;
      try { gl.dispose(); } catch {}
    }
  }

  async start(shellId, cwd = startCwd()) {
    this.fitNow();
    // Sekme kabuk başlamayı beklemeden doğru adla açılsın ("Terminal" yazıp sonra genişlemesin)
    if (!this.shellName) {
      this.shellName = shells.find((s) => s.id === shellId)?.name || '';
      if (this.tab) updateTabTitle(this.tab);
    }
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
    // Eğlence kelimesi kontrol edilirken basılan tuşlar sırası bozulmasın diye bekletilir
    if (this.held) { this.held.push(d); return; }
    this.fx.hideHint();
    if (!this.trackInput(d)) api.write(this.ptyId, d);
    this.hintSoon();
  }

  // Yazılan satırı takip eder. Enter'a basıldığında satır bir eğlence kelimesiyse
  // Enter'ı tutar (true döner) ve tryFun'a bırakır
  trackInput(d) {
    if (d === '\r') {
      const typed = this.typed, ok = this.typedOk;
      this.typed = '';
      this.typedOk = true;
      const scene = settings.fun && ok ? funScene(typed) : null;
      if (!scene) {
        // Kabuğa bir komut gidiyor (Tab ile tamamlanan satır da olabilir, o yüzden ekrana da bakılır)
        if (typed.trim() || !this.atEmptyPrompt()) this.everTyped = true;
        return false;
      }
      this.tryFun(typed, scene);
      return true;
    }
    if (d === '\x7f' || d === '\b') { this.typed = [...this.typed].slice(0, -1).join(''); return false; }
    if (d === '\x1b' || (d.length === 1 && d < ' ')) { this.typed = ''; this.typedOk = true; return false; }
    // Kaçış dizileri: ok tuşları veya terminalin Windows'a verdiği otomatik cevaplar.
    // Satır boşken yok say; doluyken satırı artık güvenle takip edemeyiz
    if (d.startsWith('\x1b')) { if (this.typed) this.typedOk = false; return false; }
    if (/[\r\n]/.test(d)) { this.typedOk = false; this.typed += ' '; this.everTyped = true; return false; }
    this.typed += d;
    return false;
  }

  // Karar Enter anında ekrana bakılarak verilir: satır "komut istemi + yazılan kelime" ise animasyon oynar,
  // değilse Enter kabuğa normal gider. Hızlı yazınca kabuk son harfleri ekrana henüz basmamış olabilir;
  // o yüzden en fazla 400 ms bekler (bekleme yalnızca bir eğlence kelimesi yazıldığında olur)
  tryFun(typed, scene) {
    this.held = [];
    const start = performance.now();
    const check = () => {
      const state = this.funLineState(typed);
      if (state === 'wait' && performance.now() - start < 400) { setTimeout(check, 25); return; }
      const held = this.held;
      this.held = null;
      if (!this.ptyId) return;
      if (state === 'yes') {
        api.write(this.ptyId, '\x7f'.repeat([...typed].length));
        this.fx.play(scene);
      } else {
        api.write(this.ptyId, '\r');
        this.everTyped = true;
      }
      for (const d of held) this.onInput(d);
      this.hintSoon();
    };
    check();
  }

  funLineState(typed) {
    const b = this.term.buffer.active;
    if (b.type !== 'normal') return 'no';
    const before = this.lineBeforeCursor();
    if (!before.endsWith(typed)) return 'wait';
    return PROMPT_RE.test(before.slice(0, before.length - typed.length).trimEnd()) ? 'yes' : 'no';
  }

  // İmlecin bulunduğu satırın imlece kadar olan kısmı. Uzun klasör yolu yüzünden alt satıra taşan
  // komut istemi tek satır olarak birleştirilir (dar panelde istem çoğu zaman taşar)
  lineBeforeCursor() {
    const b = this.term.buffer.active;
    let y = b.baseY + b.cursorY;
    let line = b.getLine(y);
    if (!line) return '';
    let text = line.translateToString(false, 0, b.cursorX);
    while (line.isWrapped && y > 0) {
      line = b.getLine(--y);
      if (!line) break;
      text = line.translateToString(false) + text;
    }
    return text;
  }

  atEmptyPrompt() {
    const b = this.term.buffer.active;
    if (b.type !== 'normal') return false;
    // İmleçten sonra yazı olmamalı
    const rest = b.getLine(b.baseY + b.cursorY)?.translateToString(true, b.cursorX) ?? '';
    if (rest.trim()) return false;
    // PowerShell istemin sonuna gerçek bir boşluk yazar; kırpıp bakıyoruz
    return PROMPT_RE.test(this.lineBeforeCursor().trimEnd());
  }

  hintSoon() {
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this.updateHint(), 150);
  }

  // Boş komut satırında soluk yazılar (yalnızca ilk gerçek komuta kadar): akan komut önerileri ve
  // eğlence modu açıksa eğlence ipucu (öneriler varken onların hemen altında sabit durur)
  updateHint() {
    const b = this.term.buffer.active;
    const atPrompt = this.tab?.activePane === this && this.typed === '' && !this.held &&
      b.viewportY === b.baseY && this.atEmptyPrompt();
    // İlk gerçek komuttan sonra ikisi de gizlenir (eğlence kelimeleri yine çalışır)
    const tips = atPrompt && settings.tips && !this.everTyped;
    const fun = atPrompt && settings.fun && !this.everTyped;
    const screen = this.host.querySelector('.xterm-screen');
    if (!(tips || fun) || !screen) { this.fx.hideHint(); return; }
    const cw = screen.clientWidth / this.term.cols;
    const ch = screen.clientHeight / this.term.rows;
    const x = screen.offsetLeft + (b.cursorX + 1) * cw;
    const y = screen.offsetTop + b.cursorY * ch;
    const font = `italic ${settings.fontWeight} ${settings.fontSize}px ${fontStack()}`;
    const maxW = this.host.clientWidth - x - 36;
    if (tips) {
      this.fx.showTips(shellKind(this), x, y, ch, font, maxW);
      if (fun && b.cursorY + 1 < this.term.rows) this.fx.showHint(x, y + ch, ch, font, maxW);
      else this.fx.hint.hidden = true;
    } else {
      this.fx.hideTips();
      this.fx.showHint(x, y, ch, font, maxW);
    }
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
// Chromium aynı anda en fazla 16 WebGL alanına izin verir (fazlası eskileri bozar).
// Bu yüzden yalnızca ekranda görünen paneller (seçili sekme) WebGL ile çizilir; diğerleri normal çizimde bekler
const MAX_WEBGL = 12;
function syncRenderers() {
  const visible = activeTab ? leaves(activeTab.root).slice(0, MAX_WEBGL) : [];
  forEachPane((p) => { if (!visible.includes(p)) p.setWebgl(false); });
  visible.forEach((p) => p.setWebgl(true));
}

function leaves(node) {
  if (!node) return [];
  return node instanceof Pane ? [node] : [...leaves(node.a), ...leaves(node.b)];
}
// Gizli paneller de dahil: tema/ayar değişikliği geri açıldıklarında da geçerli olsun
function forEachPane(fn) { for (const tb of tabs) leaves(tb.root).forEach(fn); hiddenPanes.forEach(fn); }

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

// ---------- Animasyonlar ----------
// Öğeye animasyon sınıfını ekler, animasyon bitince sınıfı kaldırıp done'ı çağırır.
// Animasyon hiç oynamazsa (öğe gizliyse) en geç max ms sonra yine biter.
// Terminal içeren öğelerde yalnızca kaydırma + saydamlık kullan: büyütme (scale) xterm'in harf ölçüsünü bozar
function animate(el, cls, done, max = 450) {
  el.classList.remove(cls);
  void el.offsetWidth;   // aynı sınıf yeniden eklenince animasyon baştan oynasın
  el.classList.add(cls);
  let over = false;
  const end = (e) => {
    if (over || (e && e.target !== el)) return;
    over = true;
    el.removeEventListener('animationend', end);
    clearTimeout(timer);
    el.classList.remove(cls);
    done?.();
  };
  el.addEventListener('animationend', end);
  const timer = setTimeout(end, max);
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
  // Sekmenin adı bu fonksiyondan hemen sonra (ekran çizilmeden) yazılıyor; genişliği ondan sonra
  // ölçüp sekmeyi tam o genişliğe kadar açıyoruz
  tab.opening = true;
  queueMicrotask(() => {
    tab.tabEl.style.setProperty('--tab-w', tab.tabEl.offsetWidth + 'px');
    animate(tab.tabEl, 'tab-in', () => { tab.opening = false; tab.tabEl.style.removeProperty('--tab-w'); });
  });
  animate(tab.el, 'content-in');
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
  for (const tb of tabs) {
    const on = tb === tab;
    tb.el.classList.toggle('active', on);
    tb.tabEl.classList.toggle('active', on);
  }
  syncRenderers();
  leaves(tab.root).forEach((p) => p.fitSoon());
  (tab.activePane || leaves(tab.root)[0])?.term.focus();
  markSeen();
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
  // Sekme çubuktan daralarak çıkar (şu anki genişliğinden başlayarak); o sırada tıklanamaz
  tab.tabEl.style.maxWidth = tab.tabEl.offsetWidth + 'px';
  animate(tab.tabEl, 'tab-out', () => tab.tabEl.remove());
  tabs.splice(idx, 1);
  if (!tabs.length) { api.closeWindow(); return; }
  if (activeTab === tab) activateTab(tabs[Math.min(idx, tabs.length - 1)]);
}

// Panelin adı: programın koyduğu başlık, yoksa kabuğun adı ("Komut İstemi" gibi adlar çevrilir)
const paneName = (p) => tq((p && (p.title || p.shellName)) || 'Terminal');

function updateTabTitle(tab) {
  if (tab === settingsTab) { tab.titleEl.textContent = t('Ayarlar'); tab.tabEl.dataset.tip = 'Ayarlar'; return; }
  const el = tab.tabEl;
  // Açılış/kapanış animasyonu sürerken genişliği o animasyon yönetir
  const before = tab.opening || el.classList.contains('tab-out') ? 0 : el.offsetWidth;
  const panes = leaves(tab.root);
  const p = tab.activePane || panes[0];
  const title = paneName(p);
  tab.titleEl.textContent = title;
  tab.tabEl.dataset.tip = title;
  tab.badgeEl.hidden = panes.length < 2;
  tab.badgeEl.textContent = panes.length;
  tab.el.classList.toggle('multi', panes.length > 1);
  tab.tabEl.classList.toggle('attention', panes.some((p) => p.attention));
  // Ad (veya panel sayısı) değişip sekme genişleyince/daralınca zıplamasın, kaysın
  if (!before) return;
  const after = el.offsetWidth;
  if (Math.abs(after - before) < 6) return;
  tab.widthAnim?.cancel();
  tab.widthAnim = el.animate([{ width: before + 'px' }, { width: after + 'px' }],
    { duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)' });
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
  const m = new RegExp(`^(?:${BASH_ENV}):(.+)$`).exec(pane.title || '');
  if (m) return bashToWindows(m[1].trim());
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

// Komut önerileri hangi kabuğun komutlarıyla gösterilsin
function shellKind(pane) {
  const id = pane.shellId;
  if (id === 'cmd') return 'cmd';
  if (id === 'gitbash') return 'bash';
  const file = (settings.customShells.find((c) => c.id === id)?.file || '').toLowerCase();
  if (/(^|[\\/])cmd(\.exe)?$/.test(file)) return 'cmd';
  if (/(bash|wsl|zsh|sh)(\.exe)?$/.test(file)) return 'bash';
  return 'powershell';
}

function bashToWindows(p) {
  if (p === '~' || p.startsWith('~/')) return paths.home + p.slice(1).replace(/\//g, '\\');
  const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
  return m ? `${m[1].toUpperCase()}:${(m[2] || '\\').replace(/\//g, '\\')}` : null;
}

// ---------- Kısa bildirim ----------
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { el.hidden = true; }, 5000);
}

// ---------- Bağlantılar ----------
async function confirmLink(uri) {
  if (!/^https?:\/\//i.test(uri) || KUI.isModalOpen()) return;
  const ok = await KUI.confirm({
    title: t('Bağlantı açılsın mı?'),
    message: t('{uri}\n\nTarayıcında açılacak. Adresi tanımıyorsan açma.', { uri }),
    ok: t('Aç'),
  });
  if (ok) api.openLink(uri);
}

// ---------- Bildirimler ----------
// Bir program dikkat istediğinde: o panele bakmıyorsan sekmede/panelde işaret, Windows bildirimi
// ve görev çubuğunda yanıp sönme. Pencere açık ve o panel seçiliyse hiçbir şey çıkmaz (zaten görüyorsun)
function attend(pane, { title = '', body = '', bell = false }) {
  if (!settings.notify || (bell && !settings.notifyBell)) return;
  const windowOn = document.hasFocus();
  const onScreen = windowOn && pane.tab && pane.tab === activeTab;
  if (onScreen && pane.tab.activePane === pane) return;
  // Arka arkaya gelen zillerde tek bildirim (yazılı bildirimler hep gösterilir)
  if (bell) {
    if (Date.now() - (pane.lastBell || 0) < 4000) return;
    pane.lastBell = Date.now();
  }
  pane.attention = true;
  renderAttention();
  if (onScreen) return;   // aynı sekmede başka panele bakıyorsun: panelin çerçevesi yanıp söner, yeter
  const name = paneName(pane);
  api.notify({
    id: pane.id,
    title: (title || name).trim(),
    body: (body || (bell ? t('Dikkatini bekliyor.') : '')).trim() + (title && title !== name ? `\n${name}` : ''),
    toast: settings.notifyToast,
    flash: settings.notifyFlash,
  });
}

// Pencereye dönülünce seçili panelin işaretini kaldır
function markSeen() {
  const p = activeTab?.activePane;
  if (!p || !document.hasFocus()) return;
  p.lastBell = 0;
  if (p.attention) { p.attention = false; renderAttention(); }
}
window.addEventListener('focus', markSeen);

function renderAttention() {
  for (const tb of tabs) {
    const panes = leaves(tb.root);
    for (const p of panes) p.el.classList.toggle('attention', p.attention);
    tb.tabEl.classList.toggle('attention', panes.some((p) => p.attention));
  }
  $('hiddenBtn').classList.toggle('attention', hiddenPanes.some((p) => p.attention));
}

function findPane(id) {
  let found = null;
  forEachPane((p) => { if (p.id === id) found = p; });
  return found;
}

// Windows bildirimine tıklanınca o terminale git
api.onNotifyClick((id) => {
  const pane = findPane(id);
  if (!pane) return;
  if (hiddenPanes.includes(pane)) { showHiddenPane(pane, 'tab'); return; }
  activateTab(pane.tab);
  focusPane(pane);
});

// ---------- Panel işlemleri ----------
function focusPane(pane) {
  const tab = pane.tab;
  tab.activePane = pane;
  for (const p of leaves(tab.root)) p.el.classList.toggle('focused', p === pane);
  syncRenderers();
  pane.term.focus();
  updateTabTitle(tab);
  for (const p of leaves(tab.root)) p.hintSoon();
  markSeen();
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
  // Yeni panel açıldığı taraftan kayarak gelir
  animate(fresh.el, 'pane-in-' + (dir === 'row' ? (before ? 'left' : 'right') : (before ? 'up' : 'down')));
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
    animate(pane.el, 'pane-in-right');
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
    row.className = 'hidden-item' + (p.attention ? ' attention' : '');
    const time = p.hiddenAt.toLocaleTimeString(i18nLocale(), { hour: '2-digit', minute: '2-digit' });
    row.innerHTML = `
      <div class="hidden-info">
        <div class="hidden-title"></div>
        <div class="hidden-last"></div>
        <div class="hidden-meta"></div>
      </div>
      <div class="hidden-actions">
        <button class="mini-btn wide" data-act="split" data-tip="Seçili panelin yanında aç">${t('Yanına aç')}</button>
        <button class="mini-btn wide" data-act="tab" data-tip="Yeni sekmede aç">${t('Sekmede aç')}</button>
        <button class="mini-btn danger" data-act="close" data-tip="Terminali kapat">×</button>
      </div>`;
    row.querySelector('.hidden-title').textContent = paneName(p);
    row.querySelector('.hidden-last').textContent = lastLine(p) || '—';
    row.querySelector('.hidden-meta').textContent = t('{time} · {tab} sekmesinden', { time, tab: p.hiddenFrom || '' });
    row.querySelector('[data-act="split"]').onclick = () => showHiddenPane(p, 'split');
    row.querySelector('[data-act="tab"]').onclick = () => showHiddenPane(p, 'tab');
    row.querySelector('[data-act="close"]').onclick = () => closePane(p);
    list.appendChild(row);
  }
  btn.classList.toggle('attention', hiddenPanes.some((p) => p.attention));
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
    el.dataset.tip = t(el.dataset.tipText) + (k ? ` (${KabukKeys.label(k)})` : '') + (el.dataset.tipMore ? t(el.dataset.tipMore) : '');
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
    box.firstElementChild.textContent = t(g.name);
    const dl = box.lastElementChild;
    const rows = KEY_ACTIONS.filter((a) => a.group === g.id && keysFor(a.id).length)
      .map((a) => [keysFor(a.id).map(KabukKeys.label).join('  '), a.name]);
    for (const [k, name] of [...rows, ...(FIXED_KEYS[g.id] || [])]) {
      const dt = document.createElement('dt');
      dt.textContent = k === 'Sağ tık' ? t(k) : k;
      const dd = document.createElement('dd');
      dd.textContent = t(name);
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

let popoverAnchor = null; // açık panel ve onu açan düğme: { panel, button, alignRight }

function togglePopover(panel, button, alignRight) {
  const wasOpen = !panel.classList.contains('hidden');
  closePopovers();
  if (wasOpen) return;
  panel.classList.remove('hidden');
  button.classList.add('on');
  popoverAnchor = { panel, button, alignRight };
  placePopover();
}

// Paneli düğmesinin altına yerleştirir. Düğme yer değiştirince (sekme açılıp kapanınca, pencere
// boyutu değişince) yeniden çağrılır; yoksa panel eski yerinde kalıp yeni sekmelerin altında kalıyordu
function placePopover() {
  if (!popoverAnchor) return;
  const { panel, button, alignRight } = popoverAnchor;
  if (panel.classList.contains('hidden')) { popoverAnchor = null; return; }
  const r = button.getBoundingClientRect();
  if (alignRight) {
    panel.style.left = '';
    panel.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  } else {
    panel.style.right = '';
    panel.style.left = Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8)) + 'px';
  }
}
new ResizeObserver(placePopover).observe($('tabs'));
window.addEventListener('resize', placePopover);

// Dışarı tıklanınca açılır panelleri kapat. Açılır listeler (ui.js) kendi dış tıklamasını
// kendisi yönetir; onların içine tıklamak burada "dışarısı" sayılmamalı. Paneli açan düğmeye
// tıklamak da sayılmaz (onu kendi tıklaması kapatır); başka bir üst çubuk düğmesi ise paneli kapatır
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.popover, .icon-btn.on, .hidden-chip.on, .kmenu, .kselect, .kmodal-back')) return;
  closePopovers();
});

function renderShellMenu() {
  const menu = $('shellMenu');
  menu.innerHTML = `<div class="popover-title">${t('Yeni sekme')}</div>`;
  for (const s of shells) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = tq(s.name) + (s.id === settings.shell ? '  ✓' : '');
    b.onclick = () => { closePopovers(); newTab(s.id); };
    menu.appendChild(b);
  }
  const hint = document.createElement('div');
  hint.className = 'popover-title';
  hint.style.marginTop = '10px';
  hint.textContent = t('Varsayılan kabuk');
  menu.appendChild(hint);
  for (const s of shells) {
    const b = document.createElement('button');
    b.className = 'menu-item';
    b.textContent = (s.id === settings.shell ? '● ' : '○ ') + tq(s.name);
    b.onclick = () => { settings.shell = s.id; saveSettings(); renderShellMenu(); if (settingsTab) renderSettings(); };
    menu.appendChild(b);
  }
  const more = document.createElement('button');
  more.className = 'menu-item menu-sep';
  more.textContent = t('Ayarlar…');
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
    updateTabTitle(settingsTab);
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

function scrollbackOptions() {
  return [1000, 5000, 10000, 50000].map((n) => ({ value: n, label: n.toLocaleString(i18nLocale()) + ' ' + t('satır') }));
}

// Chromium'un hazır öğeleri yerine Kabuk'un kendi bileşenleri (ui.js)
const ui = {
  theme: KUI.select($('setTheme'), { width: 240, maxHeight: 460, onChange: (v) => { settings.theme = v; saveSettings(); applyTheme(); } }),
  shell: KUI.select($('setShell'), { width: 220, onChange: (v) => changeSetting('shell', v) }),
  fontFamily: KUI.select($('setFontFamily'), { width: 220, onChange: (v) => { settings.fontFamily = v; applyFont(); } }),
  scrollback: KUI.select($('setScrollback'), {
    width: 160,
    options: scrollbackOptions(),
    onChange: (v) => changeSetting('scrollback', v),
  }),
  glass: KUI.slider($('setGlass'), {
    min: 0.5, max: 0.95, step: 0.05, value: settings.glass,
    format: (v) => (LANG === 'en' ? `${Math.round(v * 100)}%` : `%${Math.round(v * 100)}`),
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
  tips: KUI.toggle($('setTips'), (on) => { settings.tips = on; saveSettings(); forEachPane((p) => p.hintSoon()); }),
  splitSameDir: KUI.toggle($('setSplitSameDir'), (on) => changeSetting('splitSameDir', on)),
  confirmClose: KUI.toggle($('setConfirmClose'), (on) => changeSetting('confirmClose', on)),
  cursorBlink: KUI.toggle($('setCursorBlink'), (on) => changeSetting('cursorBlink', on)),
  copyOnSelect: KUI.toggle($('setCopyOnSelect'), (on) => changeSetting('copyOnSelect', on)),
  rightClick: KUI.toggle($('setRightClick'), (on) => changeSetting('rightClick', on)),
  notify: KUI.toggle($('setNotify'), (on) => changeSetting('notify', on)),
  notifyToast: KUI.toggle($('setNotifyToast'), (on) => changeSetting('notifyToast', on)),
  notifyFlash: KUI.toggle($('setNotifyFlash'), (on) => changeSetting('notifyFlash', on)),
  notifyBell: KUI.toggle($('setNotifyBell'), (on) => changeSetting('notifyBell', on)),
};

// Deneme: pencere önde olsa bile bildirimi gösterir
$('testNotify').onclick = () => api.notify({
  id: activeTab?.activePane?.id,
  title: 'Kabuk',
  body: t('Bildirimler çalışıyor. Claude Code işini bitirince böyle haber vereceğim.'),
  toast: settings.notifyToast,
  flash: false,
});

for (const b of $('setMode').querySelectorAll('[data-v]')) {
  b.onclick = () => { settings.mode = b.dataset.v; saveSettings(); applyTheme(); };
}
for (const b of $('setLang').querySelectorAll('[data-v]')) {
  b.onclick = () => { if (settings.lang === b.dataset.v) return; settings.lang = b.dataset.v; saveSettings(); applyLanguage(); };
}

// Dil değişince: sayfadaki sabit yazılar çevrilir, kodun oluşturduğu her şey yeniden çizilir
function applyLanguage() {
  LANG = settings.lang;
  translatePage();
  ui.scrollback.setOptions(scrollbackOptions());
  for (const tab of tabs) updateTabTitle(tab);
  rebuildKeys();
  renderAppearance();
  renderSettings();
  renderHidden();
  if (!$('shellMenu').classList.contains('hidden')) renderShellMenu();
  forEachPane((p) => p.hintSoon());
  syncMain();
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
    lang: settings.lang,
  });
  shells = await api.listShells();
  if (!shells.some((s) => s.id === settings.shell)) settings.shell = shells[0]?.id;
}

function setSegmented(id, value) {
  for (const b of $(id).querySelectorAll('[data-v]')) b.classList.toggle('on', b.dataset.v === value);
}

function renderSettings() {
  ui.shell.setOptions(shells.map((s) => ({ value: s.id, label: tq(s.name) })));
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
  ui.notify.setChecked(settings.notify);
  ui.notifyToast.setChecked(settings.notifyToast);
  ui.notifyFlash.setChecked(settings.notifyFlash);
  ui.notifyBell.setChecked(settings.notifyBell);
  for (const r of settingsPage.querySelectorAll('.notify-sub')) r.hidden = !settings.notify;
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
    row.querySelector('.set-name').textContent = tq(s.name);
    row.querySelector('.set-desc').textContent = s.file;
    const tag = row.querySelector('.set-tag');
    if (s.id === settings.shell) tag.textContent = t('Varsayılan');
    else tag.remove();
    if (s.custom) {
      const del = document.createElement('button');
      del.className = 'set-btn danger small';
      del.textContent = t('Kaldır');
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
  if (!file) { err.textContent = t('Program yolunu yaz veya Gözat ile seç.'); return; }
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
  showToast(t('"{name}" eklendi. Yeni sekme menüsünden açabilirsin.', { name: settings.customShells.at(-1).name }));
};
$('resetSettings').onclick = async () => {
  const ok = await KUI.confirm({
    title: t('Tüm ayarlar sıfırlansın mı?'),
    message: t('Tema, yazı tipi ve diğer bütün ayarlar varsayılana döner. Eklediğin kabuklar da silinir.'),
    ok: t('Sıfırla'),
    danger: true,
  });
  if (!ok) return;
  const lang = settings.lang;   // dil sıfırlanmaz: kullanıcı okuyamadığı bir dile düşmesin
  for (const k of Object.keys(settings)) delete settings[k];
  Object.assign(settings, structuredClone(DEFAULTS), { lang });
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
  showToast(t('Ayarlar varsayılana döndü.'));
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
    title.textContent = t(g.name);
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
  row.querySelector('.set-name').textContent = t(a.name);
  const desc = row.querySelector('.set-desc');
  if (recording?.id === a.id && recording.error) { desc.textContent = recording.error; desc.classList.add('set-error'); }
  else if (a.desc) desc.textContent = t(a.desc);
  else desc.remove();

  const list = row.querySelector('.kbd-list');
  const recChip = () => {
    const c = document.createElement('span');
    c.className = 'kbd-chip recording';
    c.innerHTML = `<span class="kbd-live">${t('Tuşlara bas…')}</span><span class="kbd-hint">${t('Esc: vazgeç')}</span>`;
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
    if (!keys.length) add.insertAdjacentText('beforeend', t('Ata'));
    add.onclick = () => startRecording(a.id, -1);
    list.appendChild(add);
  }
  const reset = document.createElement('button');
  reset.className = 'kbd-reset';
  reset.dataset.tip = t('Varsayılana döndür: {keys}', { keys: a.keys.map(KabukKeys.label).join(', ') || t('yok') });
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
      title: t('{key} zaten kullanılıyor', { key: KabukKeys.label(combo) }),
      message: t('Bu kısayol şu an "{name}" için ayarlı. Buraya aktarılsın mı? "{name}" bu kısayolu kaybeder.', { name: t(owner.name) }),
      ok: t('Aktar'),
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
  if (live) live.textContent = KabukKeys.heldModifiers(e) ? KabukKeys.heldModifiers(e) + '…' : t('Tuşlara bas…');
}, true);
// Başka yere tıklamak veya pencereden çıkmak kaydı iptal eder
document.addEventListener('mousedown', (e) => {
  if (recording && !e.target.closest('.kbd-list, .kmodal-back')) stopRecording();
}, true);
window.addEventListener('blur', stopRecording);

$('resetKeys').onclick = async () => {
  recording = null;
  const ok = await KUI.confirm({
    title: t('Kısayollar sıfırlansın mı?'),
    message: t('Değiştirdiğin bütün kısayollar varsayılan hallerine döner.'),
    ok: t('Sıfırla'),
    danger: true,
  });
  if (!ok) return;
  settings.keys = {};
  saveSettings();
  rebuildKeys();
  renderKeys();
  showToast(t('Kısayollar varsayılana döndü.'));
};

// Pencere kapatılırken birden fazla terminal varsa ana süreç sorar
api.onConfirmClose(async (count) => {
  if (KUI.isModalOpen()) return;
  const ok = await KUI.confirm({
    title: t('{n} terminal açık', { n: count }),
    message: t('Hepsi kapatılsın mı? İçlerinde çalışan programlar da kapanır.'),
    ok: t('Hepsini kapat'),
    danger: true,
  });
  if (ok) api.closeWindow(true);
});

// ---------- Başlat ----------
(async () => {
  translatePage();
  paths = await api.getPaths();
  await syncMain();
  detectFonts();
  rebuildKeys();
  applyTheme();
  renderFontControls();
  await loadFont();
  await newTab();
})();
