'use strict';
// Dil desteği: Türkçe / English.
//
// Metinler kodda ve index.html'de Türkçe yazılır; İngilizce karşılıkları aşağıdaki EN sözlüğündedir.
//   Kodda:        t('Yeni sekme')  ·  değişkenli: t('{n} terminal açık', { n: 3 })
//   index.html:   sabit yazılar translatePage() ile kendiliğinden çevrilir. İçinde <b> gibi etiket olan
//                 paragraflara data-i18n-html eklenir (bütün paragraf tek parça çevrilir).
//   data-tip:     Türkçe yazılır, ipucu gösterilirken çevrilir (ui.js).
// Yeni bir yazı eklerken İngilizcesini EN'e eklemeyi unutma: İngilizce açıkken i18nMissing() eksikleri listeler.

let LANG = 'tr';
const I18N_MISSING = new Set();
const i18nKey = (s) => String(s).replace(/\s+/g, ' ').trim();

function i18nLookup(text, quiet) {
  if (LANG === 'tr' || text == null) return text;
  const k = i18nKey(text);
  if (!k) return text;
  if (Object.hasOwn(EN, k)) {
    const [, lead, , tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    return lead + EN[k] + tail;
  }
  if (!quiet) I18N_MISSING.add(k);
  return text;
}

// Arayüz yazısı
function t(text, vars) {
  let s = i18nLookup(text, false);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

// Çevirisi olmayabilecek yazılar için (kabuk adları, programların koyduğu başlıklar): yoksa olduğu gibi döner
function tq(text) { return i18nLookup(text, true); }

const i18nLocale = () => (LANG === 'en' ? 'en-US' : 'tr-TR');
const i18nMissing = () => [...I18N_MISSING];

// ---------- index.html'deki sabit yazılar ----------
// Kodun kendisinin doldurduğu yerler (zaten t() ile yazılıyor) ve terminaller atlanır
const I18N_SKIP = [
  '#tabs', '.pane', '#helpKeys', '#hiddenList', '#shellMenu', '#keyGroups', '#shellList', '#hiddenCount',
  '#startDirFixed', '#fontPreview', '#fontSizeLabel', '#addShellError', '#setLang', '.set-path', '.kselect',
  '.kslider-host', '.kmenu', '.ktip', '.kmodal-back', '#toast', 'script', 'style', 'svg',
].join(', ');
const i18nOrigText = new WeakMap();
const i18nOrigHtml = new WeakMap();
const i18nOrigAttr = new WeakMap();

function translatePage(root = document.body) {
  document.documentElement.lang = LANG;
  for (const el of root.querySelectorAll('[data-i18n-html]')) {
    if (!i18nOrigHtml.has(el)) i18nOrigHtml.set(el, el.innerHTML);
    el.innerHTML = t(i18nOrigHtml.get(el));
  }
  for (const el of root.querySelectorAll('[placeholder]')) {
    if (!i18nOrigAttr.has(el)) i18nOrigAttr.set(el, el.getAttribute('placeholder'));
    el.setAttribute('placeholder', t(i18nOrigAttr.get(el)));
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || p.closest(I18N_SKIP) || p.closest('[data-i18n-html]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!i18nOrigText.has(n)) i18nOrigText.set(n, n.nodeValue);
    const orig = i18nOrigText.get(n);
    if (/\p{L}/u.test(orig)) n.nodeValue = t(orig);
  }
}

// ---------- İngilizce sözlük ----------
const EN = {
  // Üst çubuk ve açılır paneller
  'Yeni sekme': 'New tab',
  'Kabuk seç': 'Choose shell',
  'Gizli': 'Hidden',
  'Gizli terminaller': 'Hidden terminals',
  'Sağa terminal aç': 'Open terminal to the right',
  'Aşağıya terminal aç': 'Open terminal below',
  'Ayarlar': 'Settings',
  'Ayarlar…': 'Settings…',
  'Kısayollar': 'Shortcuts',
  'Kısayolları değiştir…': 'Change shortcuts…',
  'Sekmeyi kapat': 'Close tab',
  'Paneli gizle': 'Hide pane',
  '— kapanmaz, arka planda çalışır': '— keeps running in the background',
  'Paneli kapat': 'Close pane',
  'Terminal': 'Terminal',
  'Varsayılan kabuk': 'Default shell',
  'Komut İstemi': 'Command Prompt',

  // Gizli terminaller
  'Seçili panelin yanında aç': 'Open next to the selected pane',
  'Yanına aç': 'Open beside',
  'Yeni sekmede aç': 'Open in a new tab',
  'Sekmede aç': 'Open in tab',
  'Terminali kapat': 'Close terminal',
  '{time} · {tab} sekmesinden': '{time} · from {tab}',

  // Kısayollar penceresi (sabit olanlar)
  'Sağ tık': 'Right-click',
  'Seçiliyse kopyala, değilse durdur': 'Copy if selected, otherwise stop',
  'Kopyala / yapıştır': 'Copy / paste',
  'Yeni satır (Claude Code)': 'New line (Claude Code)',

  // Uyarılar, onay pencereleri, bildirimler
  'Tamam': 'OK',
  'Vazgeç': 'Cancel',
  'Bağlantı açılsın mı?': 'Open this link?',
  '{uri} Tarayıcında açılacak. Adresi tanımıyorsan açma.': "{uri}\n\nIt will open in your browser. Don't open it if you don't recognize the address.",
  'Aç': 'Open',
  'Dikkatini bekliyor.': 'Needs your attention.',
  'Bildirimler çalışıyor. Claude Code işini bitirince böyle haber vereceğim.': "Notifications are working. I'll let you know like this when Claude Code finishes.",
  '{n} terminal açık': '{n} terminals open',
  'Hepsi kapatılsın mı? İçlerinde çalışan programlar da kapanır.': 'Close them all? Programs running in them will be closed too.',
  'Hepsini kapat': 'Close all',
  'Tüm ayarlar sıfırlansın mı?': 'Reset all settings?',
  'Tema, yazı tipi ve diğer bütün ayarlar varsayılana döner. Eklediğin kabuklar da silinir.': 'Theme, font and all other settings go back to their defaults. Shells you added are removed too.',
  'Sıfırla': 'Reset',
  'Ayarlar varsayılana döndü.': 'Settings were reset to default.',
  'Kısayollar sıfırlansın mı?': 'Reset shortcuts?',
  'Değiştirdiğin bütün kısayollar varsayılan hallerine döner.': 'All shortcuts you changed go back to their defaults.',
  'Kısayollar varsayılana döndü.': 'Shortcuts were reset to default.',
  '{key} zaten kullanılıyor': '{key} is already in use',
  'Bu kısayol şu an "{name}" için ayarlı. Buraya aktarılsın mı? "{name}" bu kısayolu kaybeder.': 'This shortcut is currently set for "{name}". Move it here? "{name}" will lose this shortcut.',
  'Aktar': 'Move',
  '"{name}" eklendi. Yeni sekme menüsünden açabilirsin.': '"{name}" added. You can open it from the new tab menu.',
  'Program yolunu yaz veya Gözat ile seç.': 'Type the program path or pick it with Browse.',

  // Ayarlar: sol menü
  'Başlangıç': 'Startup',
  'Görünüm': 'Appearance',
  'Yazı tipi': 'Font',
  'Bildirimler': 'Notifications',
  'Kabuklar': 'Shells',

  // Ayarlar: Başlangıç
  'Yeni sekmeler bununla açılır. Bölünen panel, böldüğün panelle aynı kabuğu kullanır.': 'New tabs open with this shell. A split pane uses the same shell as the pane you split.',
  'Başlangıç klasörü': 'Start folder',
  'Yeni bir terminal açıldığında hangi klasörde başlasın.': 'The folder a new terminal starts in.',
  'Kullanıcı': 'User folder',
  'Masaüstü': 'Desktop',
  'Özel klasör': 'Custom folder',
  'Örn. C:\\Projeler veya %USERPROFILE%\\Belgeler': 'e.g. C:\\Projects  or  %USERPROFILE%\\Documents',
  'Gözat…': 'Browse…',
  'Bölünen panel aynı klasörde açılsın': 'Open split panes in the same folder',
  'Ekranı bölünce yeni panel, o an bulunduğun klasörden başlar (PowerShell, CMD, Git Bash).': 'When you split, the new pane starts in the folder you are currently in (PowerShell, CMD, Git Bash).',
  'Açılışta pencere': 'Window on startup',
  'Kabuk açıldığında pencere ne boyutta olsun.': 'How big the window should be when Kabuk opens.',
  'Normal': 'Normal',
  'Ekranı kapla': 'Maximized',
  'Son halini hatırla': 'Remember last size',
  'Kapatırken sor': 'Ask before closing',
  'Birden fazla terminal açıkken pencereyi kapatmadan önce onay ister.': 'Asks before closing the window when more than one terminal is open.',

  // Ayarlar: Görünüm
  'Dil / Language': 'Language / Dil',
  "Kabuk'un menülerinin ve yazılarının dili.": "The language of Kabuk's menus and text.",
  'Tema': 'Theme',
  'Renkler terminale ve pencereye birlikte uygulanır. Listede bir harfe basınca o harfle başlayan temaya atlar.': 'Colors apply to both the terminal and the window. In the list, press a letter to jump to the themes starting with it.',
  'Kabuk temaları': 'Kabuk themes',
  'Bilinen temalar': 'Popular themes',
  'Kar': 'Snow',
  'Gece Mavisi': 'Midnight Blue',
  'Mor Rüya': 'Purple Dream',
  'Okyanus': 'Ocean',
  'Matrix': 'Matrix',
  'Gün Batımı': 'Sunset',
  'Sakura': 'Sakura',
  'Koyu / açık': 'Dark / light',
  "Otomatik seçilirse Windows'un ayarına uyar.": 'Automatic follows your Windows setting.',
  'Otomatik': 'Automatic',
  'Koyu': 'Dark',
  'Açık': 'Light',
  'Saf siyah arka plan': 'Pure black background',
  'Koyu temalarda zemin kapkara olur.': 'Dark themes get a pitch-black background.',
  'Buzlu cam efekti': 'Frosted glass effect',
  'Pencerenin arkası bulanık ve yarı saydam görünür.': 'The window background looks blurred and translucent.',
  'Cam yoğunluğu': 'Glass opacity',
  'Azaldıkça arkadaki pencereler daha çok görünür.': 'Lower values show more of the windows behind.',
  'Eğlence modu ✨': 'Fun mode ✨',
  'Boş satırda ipuçları ve gizli kelimelerle küçük animasyonlar.': 'Hints on the empty line and small animations triggered by secret words.',
  'Komut önerileri 💡': 'Command suggestions 💡',
  'Yeni açılan terminalde, bir şey yazana kadar boş satırda örnek komutlar akar.': 'In a new terminal, example commands scroll by on the empty line until you type something.',

  // Ayarlar: Yazı tipi
  'Kalınlık': 'Weight',
  'Çok ince': 'Extra light',
  'İnce': 'Light',
  'Orta': 'Medium',
  'Yazı boyutu': 'Font size',
  'Ctrl + fare tekerleğiyle de değişir.': 'You can also change it with Ctrl + mouse wheel.',

  // Ayarlar: Terminal
  'İmleç şekli': 'Cursor shape',
  '▏ Çizgi': '▏ Bar',
  '█ Blok': '█ Block',
  '▁ Alt çizgi': '▁ Underline',
  'İmleç yanıp sönsün': 'Blinking cursor',
  'Satır aralığı': 'Line spacing',
  'Satırlar arasındaki boşluk.': 'The space between lines.',
  'Geçmiş': 'Scrollback',
  'Yukarı kaydırınca en fazla kaç satır geri gidilebilsin.': 'How many lines you can scroll back up.',
  'satır': 'lines',
  'Seçince kopyala': 'Copy on select',
  "Fareyle seçtiğin yazı Ctrl+C'ye basmadan panoya kopyalanır.": 'Text you select with the mouse is copied to the clipboard without pressing Ctrl+C.',
  'Sağ tık ile kopyala / yapıştır': 'Right-click to copy / paste',
  'Seçim varsa kopyalar, yoksa yapıştırır.': 'Copies if there is a selection, otherwise pastes.',

  // Ayarlar: Bildirimler
  'Bir program dikkatini istediğinde haber ver: Claude Code işini bitirince veya onay beklerken. O terminale zaten bakıyorsan bildirim çıkmaz; başka sekmedeysen sekmede bir nokta belirir.': "Let you know when a program needs your attention: when Claude Code finishes or is waiting for approval. You won't get a notification if you're already looking at that terminal; if you're on another tab, a dot appears on the tab.",
  'Windows bildirimi': 'Windows notification',
  'Kabuk arkadayken ekranın köşesinde bildirim çıkar. Tıklayınca o terminale gider.': 'Shows a notification in the corner of the screen while Kabuk is in the background. Click it to jump to that terminal.',
  'Görev çubuğunda yanıp sön': 'Flash in the taskbar',
  "Kabuk'un görev çubuğundaki simgesi, pencereye dönene kadar turuncu yanar.": "Kabuk's taskbar icon glows orange until you return to the window.",
  'Zil sinyalini de say': 'Count the bell signal too',
  'Bazı programlar yazı yerine sadece zil sinyali gönderir. Çok sık bildirim gelirse kapat.': 'Some programs send only a bell signal instead of text. Turn this off if you get too many notifications.',
  'Dene': 'Test',
  "Bir deneme bildirimi gönderir. Windows bildirimi çıkmıyorsa Windows Ayarları > Sistem > Bildirimler'de Kabuk'un açık olduğuna bak.": 'Sends a test notification. If no Windows notification appears, make sure Kabuk is turned on in Windows Settings > System > Notifications.',
  'Deneme bildirimi': 'Test notification',
  'Programların bildirim göndermesi için': 'Letting programs send notifications',
  'Claude Code': 'Claude Code',
  "Claude Code Kabuk'u tanımadığı için kendiliğinden bildirim göndermez. Bir kez ayarlaman yeterli: Claude Code'da <b>/config</b> yaz, <b>Notifications</b> satırını <b>Ghostty</b> yap.": "Claude Code doesn't recognize Kabuk, so it won't send notifications on its own. You only need to set this once: in Claude Code, type <b>/config</b> and set <b>Notifications</b> to <b>Ghostty</b>.",
  'Codex': 'Codex',
  'Kullanıcı klasöründeki <b>.codex\\config.toml</b> dosyasına şunu ekle:': 'Add this to the <b>.codex\\config.toml</b> file in your user folder:',

  // Ayarlar: Kısayollar
  'Değiştirmek istediğin kısayola tıkla, sonra yeni tuşlara bas. <b>+</b> ile aynı işe ikinci bir kısayol ekleyebilirsin. Tuşlar Ctrl veya Alt ile birlikte olmalı.': 'Click the shortcut you want to change, then press the new keys. Use <b>+</b> to add a second shortcut for the same action. Keys must be combined with Ctrl or Alt.',
  'Kısayolları varsayılana döndür': 'Reset shortcuts to default',
  'Tuşlara bas…': 'Press keys…',
  'Esc: vazgeç': 'Esc: cancel',
  'Değiştirmek için tıkla': 'Click to change',
  'Bu kısayolu kaldır': 'Remove this shortcut',
  'Bir kısayol daha ekle': 'Add another shortcut',
  'Kısayol ata': 'Assign a shortcut',
  'Ata': 'Assign',
  'Varsayılana döndür: {keys}': 'Reset to default: {keys}',
  'yok': 'none',
  'Boşluk': 'Space',
  'Ctrl veya Alt ile birlikte bas (tek başına tuş yazı yazarken lazım).': 'Press it together with Ctrl or Alt (single keys are needed for typing).',
  'Bu birleşim "{key}" karakterini yazıyor (AltGr). Başka bir tuş dene.': 'This combination types the "{key}" character (AltGr). Try another key.',
  'Ctrl+C programları durdurmak için ayrılmış.': 'Ctrl+C is reserved for stopping programs.',
  // Kısayol grupları ve işlemler (keys.js)
  'Yeni terminal açma (bölme)': 'Opening terminals (split)',
  'Paneller arasında gezinme': 'Moving between panes',
  'Sekmeler ve paneller': 'Tabs and panes',
  'Yazı ve pano': 'Text and clipboard',
  'Yukarıya terminal aç': 'Open terminal above',
  'Sola terminal aç': 'Open terminal to the left',
  'Alttaki panele geç': 'Go to the pane below',
  'Sağdaki panele geç': 'Go to the pane on the right',
  'Üstteki panele geç': 'Go to the pane above',
  'Soldaki panele geç': 'Go to the pane on the left',
  'Kapanmaz, arka planda çalışmaya devam eder.': "It doesn't close; it keeps running in the background.",
  'Sonraki sekme': 'Next tab',
  'Önceki sekme': 'Previous tab',
  'Kopyala': 'Copy',
  'Yapıştır': 'Paste',
  'Yazıyı büyüt': 'Increase font size',
  'Yazıyı küçült': 'Decrease font size',
  'Yazı boyutunu sıfırla': 'Reset font size',

  // Ayarlar: Kabuklar
  'Varsayılan': 'Default',
  'Kaldır': 'Remove',
  'Kabuk ekle': 'Add shell',
  'Listede olmayan bir programı (Python, Node, SSH, WSL…) kabuk olarak ekle.': 'Add a program that is not in the list (Python, Node, SSH, WSL…) as a shell.',
  'Ad (örn. Python)': 'Name (e.g. Python)',
  'Program (örn. python.exe veya tam yolu)': 'Program (e.g. python.exe or its full path)',
  'Ek parametreler (isteğe bağlı)': 'Extra arguments (optional)',
  'Ekle': 'Add',
  'Değişiklikler hemen uygulanır ve bu bilgisayarda kaydedilir.': 'Changes apply immediately and are saved on this computer.',
  'Tüm ayarları sıfırla': 'Reset all settings',

  // Eğlence modu ve komut önerileri (fun.js)
  '✨ eğlence için yaz: kedi · köpek · kuş · balık · kar · fişek · kalp': '✨ for fun, type: cat · dog · bird · fish · snow · fireworks · heart',
  '💡 dene:': '💡 try:',
  'mkdir yeni-klasor': 'mkdir new-folder',
  'notepad notlar.txt': 'notepad notes.txt',
  'cat notlar.txt': 'cat notes.txt',
  "Claude Code'u başlatır": 'starts Claude Code',
  'bu klasördeki dosyaları listeler': 'lists the files in this folder',
  'bu klasördeki her şeyi listeler': 'lists everything in this folder',
  'bir üst klasöre çıkar': 'goes up one folder',
  'Masaüstüne gider': 'goes to your Desktop',
  "bu klasörü Dosya Gezgini'nde açar": 'opens this folder in File Explorer',
  "bu klasörü VS Code'da açar": 'opens this folder in VS Code',
  'ekranı temizler': 'clears the screen',
  'yeni bir klasör oluşturur': 'creates a new folder',
  "dosyayı Not Defteri'nde açar": 'opens the file in Notepad',
  "Git'te nelerin değiştiğini gösterir": 'shows what changed in Git',
  'güncellenebilecek programları listeler': 'lists programs that can be updated',
  'ağ bilgilerini gösterir': 'shows your network details',
  'internet bağlantısını dener': 'tests your internet connection',
  'çalışan programları listeler': 'lists running programs',
  'daha önce yazdığın komutları gösterir': 'shows the commands you typed before',
  'hangi klasörde olduğunu gösterir': 'shows which folder you are in',
  'dosyanın içini ekrana yazar': 'prints the file to the screen',
  'son kayıtları (commit) listeler': 'lists recent commits',
};
