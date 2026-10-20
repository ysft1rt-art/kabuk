'use strict';

// Klavye kısayolları: hangi işlem hangi tuşlarla yapılır.
// Kullanıcı Ayarlar > Kısayollar'dan değiştirebilir; değiştirdikleri settings.keys'te saklanır,
// değiştirmedikleri buradaki varsayılanla çalışır.
//
// Tuş birleşimi "Ctrl+Alt+Shift+Tuş" biçiminde yazılır (sıra hep bu). Tuş, klavyenin o an yazdığı
// karakterdir (Türkçe klavyede Ç, Ö, İ olduğu gibi). Harf olmayan işaretlerde Shift yazılmaz,
// çünkü işaretin kendisi zaten Shift'i içerir: Türkçe klavyede "=" Shift+0'dır ama "Ctrl+=" diye kaydedilir.
window.KabukKeys = (() => {
  const GROUPS = [
    { id: 'split', name: 'Yeni terminal açma (bölme)' },
    { id: 'focus', name: 'Paneller arasında gezinme' },
    { id: 'tabs', name: 'Sekmeler ve paneller' },
    { id: 'text', name: 'Yazı ve pano' },
  ];

  // term: yalnızca terminalin içindeyken çalışır (ayarlardaki yazı kutularında Ctrl+V normal yapıştırsın)
  const ACTIONS = [
    { id: 'splitDown', group: 'split', name: 'Aşağıya terminal aç', keys: ['Alt+ArrowDown', 'Ctrl+Shift+E'] },
    { id: 'splitRight', group: 'split', name: 'Sağa terminal aç', keys: ['Alt+ArrowRight', 'Ctrl+Shift+D'] },
    { id: 'splitUp', group: 'split', name: 'Yukarıya terminal aç', keys: ['Alt+ArrowUp'] },
    { id: 'splitLeft', group: 'split', name: 'Sola terminal aç', keys: ['Alt+ArrowLeft'] },

    { id: 'focusDown', group: 'focus', name: 'Alttaki panele geç', keys: ['Ctrl+Alt+ArrowDown'] },
    { id: 'focusRight', group: 'focus', name: 'Sağdaki panele geç', keys: ['Ctrl+Alt+ArrowRight'] },
    { id: 'focusUp', group: 'focus', name: 'Üstteki panele geç', keys: ['Ctrl+Alt+ArrowUp'] },
    { id: 'focusLeft', group: 'focus', name: 'Soldaki panele geç', keys: ['Ctrl+Alt+ArrowLeft'] },

    { id: 'newTab', group: 'tabs', name: 'Yeni sekme', keys: ['Ctrl+Shift+T'] },
    { id: 'closePane', group: 'tabs', name: 'Paneli kapat', keys: ['Ctrl+Shift+W'] },
    { id: 'hidePane', group: 'tabs', name: 'Paneli gizle', desc: 'Kapanmaz, arka planda çalışmaya devam eder.', keys: ['Ctrl+Shift+H'] },
    { id: 'nextTab', group: 'tabs', name: 'Sonraki sekme', keys: ['Ctrl+Tab'] },
    { id: 'prevTab', group: 'tabs', name: 'Önceki sekme', keys: ['Ctrl+Shift+Tab'] },
    { id: 'settings', group: 'tabs', name: 'Ayarlar', keys: ['Ctrl+,'] },

    { id: 'copy', group: 'text', name: 'Kopyala', term: true, keys: ['Ctrl+Shift+C'] },
    { id: 'paste', group: 'text', name: 'Yapıştır', term: true, keys: ['Ctrl+V', 'Ctrl+Shift+V'] },
    { id: 'fontUp', group: 'text', name: 'Yazıyı büyüt', keys: ['Ctrl+=', 'Ctrl++'] },
    { id: 'fontDown', group: 'text', name: 'Yazıyı küçült', keys: ['Ctrl+-'] },
    { id: 'fontReset', group: 'text', name: 'Yazı boyutunu sıfırla', keys: ['Ctrl+0'] },
  ];

  const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS'];
  const IGNORED = ['Dead', 'Unidentified', 'Process', 'CapsLock', 'NumLock', 'ScrollLock'];

  // Basılan tuşlardan birleşim adı. Yalnızca Ctrl/Alt/Shift basılıysa null
  function fromEvent(e) {
    if (MODIFIERS.includes(e.key) || IGNORED.includes(e.key)) return null;
    let key = e.key;
    let shift = e.shiftKey;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) {
      key = key.toLocaleUpperCase('tr');
      if (!/\p{L}/u.test(key)) shift = false;   // işaret: Shift zaten içinde
    }
    return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (shift ? 'Shift+' : '') + key;
  }

  // Tuşa basılırken ekranda canlı göstermek için: "Ctrl+Alt+…"
  function heldModifiers(e) {
    return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '');
  }

  function split(combo) {
    const m = /^((?:(?:Ctrl|Alt|Shift)\+)*)(.+)$/.exec(combo);
    return { mods: m[1] ? m[1].slice(0, -1).split('+') : [], key: m[2] };
  }

  const KEY_NAMES = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Escape: 'Esc', Delete: 'Del', Insert: 'Ins', PageUp: 'PgUp', PageDown: 'PgDn',
    Backspace: '⌫', Enter: 'Enter', Space: 'Boşluk',
  };

  // Ekranda gösterilecek parçalar: ['Ctrl', 'Alt', '↓']
  function parts(combo) {
    const { mods, key } = split(combo);
    return [...mods, KEY_NAMES[key] || key];
  }
  const label = (combo) => parts(combo).join('+');

  // Kısayol olarak kullanılamayacak birleşimler için sebep (Türkçe), uygunsa null
  function problem(combo) {
    const { mods, key } = split(combo);
    const fkey = /^F\d{1,2}$/.test(key);
    if (!mods.includes('Ctrl') && !mods.includes('Alt') && !fkey) {
      return 'Ctrl veya Alt ile birlikte bas (tek başına tuş yazı yazarken lazım).';
    }
    // Türkçe klavyede AltGr = Ctrl+Alt; AltGr+Q gibi tuşlar @ yazar, kısayol yapılırsa @ yazılamaz
    if (mods.includes('Ctrl') && mods.includes('Alt') && key.length === 1 && !/[\p{L}\p{N}]/u.test(key)) {
      return `Bu birleşim "${key}" karakterini yazıyor (AltGr). Başka bir tuş dene.`;
    }
    if (combo === 'Ctrl+C') return 'Ctrl+C programları durdurmak için ayrılmış.';
    return null;
  }

  return { GROUPS, ACTIONS, fromEvent, heldModifiers, parts, label, problem };
})();
