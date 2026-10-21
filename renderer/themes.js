// Her temanın koyu (dark) ve açık (light) hali var: arayüz renkleri (ui) + terminal renkleri (term)
// Açık hallerde "white" renkleri bilerek koyu tutuldu, yoksa beyaz zeminde görünmezler.
window.KABUK_THEMES = {
  kar: {
    name: 'Kar',
    light: {
      ui: { bg: '#fbfbfd', bar: '#eceef3', tab: '#e2e5ec', tabActive: '#fbfbfd', fg: '#2e3440', dim: '#7b8496', accent: '#3b6fe0', border: '#d5d9e2' },
      term: {
        background: '#fbfbfd', foreground: '#2e3440', cursor: '#3b6fe0', cursorAccent: '#fbfbfd', selectionBackground: '#cfdcf7',
        black: '#2e3440', red: '#c8364b', green: '#2f8a4a', yellow: '#a8740a', blue: '#3b6fe0', magenta: '#9145b6', cyan: '#1b8a99', white: '#7b8496',
        brightBlack: '#6b7486', brightRed: '#e0485f', brightGreen: '#3aa35a', brightYellow: '#c48a10', brightBlue: '#5585f0', brightMagenta: '#a85ccc', brightCyan: '#22a3b4', brightWhite: '#4c5466',
      },
    },
    dark: {
      ui: { bg: '#15181e', bar: '#0f1115', tab: '#1c2028', tabActive: '#15181e', fg: '#e5e9f0', dim: '#7b8496', accent: '#6b9bff', border: '#262b35' },
      term: {
        background: '#15181e', foreground: '#e5e9f0', cursor: '#6b9bff', cursorAccent: '#15181e', selectionBackground: '#2c3d63',
        black: '#3b4252', red: '#ef6b7b', green: '#8fd694', yellow: '#ebcb8b', blue: '#6b9bff', magenta: '#c99be0', cyan: '#6fd0dc', white: '#d8dee9',
        brightBlack: '#5c6577', brightRed: '#ff8a98', brightGreen: '#a8e6ad', brightYellow: '#f5dba6', brightBlue: '#8fb3ff', brightMagenta: '#dbb6ef', brightCyan: '#93e0ea', brightWhite: '#f5f7fa',
      },
    },
  },
  gece: {
    name: 'Gece Mavisi',
    dark: {
      ui: { bg: '#1a1b26', bar: '#16161e', tab: '#1f2335', tabActive: '#1a1b26', fg: '#c0caf5', dim: '#565f89', accent: '#7aa2f7', border: '#292e42' },
      term: {
        background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', cursorAccent: '#1a1b26', selectionBackground: '#33467c',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68', blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
      },
    },
    light: {
      ui: { bg: '#e8e9ef', bar: '#dcdee6', tab: '#d2d5df', tabActive: '#e8e9ef', fg: '#3760bf', dim: '#7880a8', accent: '#2e7de9', border: '#c4c8d6' },
      term: {
        background: '#e8e9ef', foreground: '#3760bf', cursor: '#3760bf', cursorAccent: '#e8e9ef', selectionBackground: '#b7c1e3',
        black: '#4c505e', red: '#d62a5c', green: '#4f6e2f', yellow: '#8c6c3e', blue: '#2e7de9', magenta: '#8a46e0', cyan: '#007197', white: '#6172b0',
        brightBlack: '#6a6f87', brightRed: '#f52a65', brightGreen: '#587539', brightYellow: '#a27629', brightBlue: '#4a8ff0', brightMagenta: '#9854f1', brightCyan: '#0f84ad', brightWhite: '#3d4a7a',
      },
    },
  },
  mor: {
    name: 'Mor Rüya',
    dark: {
      ui: { bg: '#282a36', bar: '#21222c', tab: '#2d2f3d', tabActive: '#282a36', fg: '#f8f8f2', dim: '#6272a4', accent: '#bd93f9', border: '#383a4a' },
      term: {
        background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', cursorAccent: '#282a36', selectionBackground: '#44475a',
        black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c', blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
        brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
      },
    },
    light: {
      ui: { bg: '#fbf8ff', bar: '#efe9fa', tab: '#e5dcf5', tabActive: '#fbf8ff', fg: '#2b2340', dim: '#7d7396', accent: '#644ac9', border: '#ddd3ef' },
      term: {
        background: '#fbf8ff', foreground: '#2b2340', cursor: '#644ac9', cursorAccent: '#fbf8ff', selectionBackground: '#ddd0f7',
        black: '#2b2340', red: '#cb3a2a', green: '#14710a', yellow: '#846e15', blue: '#644ac9', magenta: '#a3144d', cyan: '#036a96', white: '#7d7396',
        brightBlack: '#5c5375', brightRed: '#d74c3d', brightGreen: '#198d0c', brightYellow: '#9e841a', brightBlue: '#7862d1', brightMagenta: '#bf185a', brightCyan: '#047fb4', brightWhite: '#4a4063',
      },
    },
  },
  matrix: {
    name: 'Matrix',
    dark: {
      ui: { bg: '#020a04', bar: '#000000', tab: '#04140a', tabActive: '#020a04', fg: '#33ff66', dim: '#1a7a33', accent: '#33ff66', border: '#0c2a14' },
      term: {
        background: '#020a04', foreground: '#33ff66', cursor: '#33ff66', cursorAccent: '#020a04', selectionBackground: '#0f4d22',
        black: '#000000', red: '#5cff5c', green: '#33ff66', yellow: '#99ff99', blue: '#22cc55', magenta: '#66ff99', cyan: '#33ffaa', white: '#aaffbb',
        brightBlack: '#1a5c2a', brightRed: '#88ff88', brightGreen: '#66ff88', brightYellow: '#ccffcc', brightBlue: '#44ee77', brightMagenta: '#99ffbb', brightCyan: '#66ffcc', brightWhite: '#e6ffe9',
      },
    },
    light: {
      ui: { bg: '#f1faf2', bar: '#e0f2e3', tab: '#d0ead5', tabActive: '#f1faf2', fg: '#0d5c22', dim: '#5e8f69', accent: '#138a36', border: '#c2e0c9' },
      term: {
        background: '#f1faf2', foreground: '#0d5c22', cursor: '#138a36', cursorAccent: '#f1faf2', selectionBackground: '#bfe6c8',
        black: '#063814', red: '#1c7a2e', green: '#138a36', yellow: '#4f7a12', blue: '#0f6b3a', magenta: '#2a7d4f', cyan: '#127a68', white: '#5e8f69',
        brightBlack: '#2f5c3a', brightRed: '#24923a', brightGreen: '#17a240', brightYellow: '#5f9116', brightBlue: '#148449', brightMagenta: '#349563', brightCyan: '#18947e', brightWhite: '#0a4a1b',
      },
    },
  },
  gunbatimi: {
    name: 'Gün Batımı',
    dark: {
      ui: { bg: '#282828', bar: '#1d2021', tab: '#32302f', tabActive: '#282828', fg: '#ebdbb2', dim: '#928374', accent: '#fe8019', border: '#3c3836' },
      term: {
        background: '#282828', foreground: '#ebdbb2', cursor: '#fe8019', cursorAccent: '#282828', selectionBackground: '#504945',
        black: '#282828', red: '#fb4934', green: '#b8bb26', yellow: '#fabd2f', blue: '#83a598', magenta: '#d3869b', cyan: '#8ec07c', white: '#d5c4a1',
        brightBlack: '#665c54', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#fbf1c7',
      },
    },
    light: {
      ui: { bg: '#fbf1c7', bar: '#f2e5bc', tab: '#ebdbb2', tabActive: '#fbf1c7', fg: '#3c3836', dim: '#928374', accent: '#d65d0e', border: '#e0cfa4' },
      term: {
        background: '#fbf1c7', foreground: '#3c3836', cursor: '#d65d0e', cursorAccent: '#fbf1c7', selectionBackground: '#ebdbb2',
        black: '#3c3836', red: '#9d0006', green: '#79740e', yellow: '#b57614', blue: '#076678', magenta: '#8f3f71', cyan: '#427b58', white: '#7c6f64',
        brightBlack: '#665c54', brightRed: '#cc241d', brightGreen: '#98971a', brightYellow: '#d79921', brightBlue: '#458588', brightMagenta: '#b16286', brightCyan: '#689d6a', brightWhite: '#504945',
      },
    },
  },
  sakura: {
    name: 'Sakura',
    dark: {
      ui: { bg: '#2a1f2d', bar: '#221825', tab: '#33263a', tabActive: '#2a1f2d', fg: '#f5e1ec', dim: '#9a7b96', accent: '#ff9ecf', border: '#3d2d44' },
      term: {
        background: '#2a1f2d', foreground: '#f5e1ec', cursor: '#ff9ecf', cursorAccent: '#2a1f2d', selectionBackground: '#5a3d5e',
        black: '#221825', red: '#ff7a9c', green: '#a8e6a3', yellow: '#ffd6a5', blue: '#a0c4ff', magenta: '#ff9ecf', cyan: '#9be7e3', white: '#e8d3e0',
        brightBlack: '#6b5070', brightRed: '#ff9bb5', brightGreen: '#c2f0be', brightYellow: '#ffe4c2', brightBlue: '#bdd6ff', brightMagenta: '#ffbde0', brightCyan: '#b8f0ed', brightWhite: '#fff5fa',
      },
    },
    light: {
      ui: { bg: '#fff6f9', bar: '#fbe7ef', tab: '#f6d9e5', tabActive: '#fff6f9', fg: '#5a3d5e', dim: '#a08299', accent: '#d6417f', border: '#efd0dd' },
      term: {
        background: '#fff6f9', foreground: '#5a3d5e', cursor: '#d6417f', cursorAccent: '#fff6f9', selectionBackground: '#f7cfe0',
        black: '#4a3150', red: '#d0386a', green: '#3f8f4a', yellow: '#a86b00', blue: '#3b6fc4', magenta: '#c2408a', cyan: '#2a8f95', white: '#a08299',
        brightBlack: '#7a5f80', brightRed: '#e0507e', brightGreen: '#4fa65b', brightYellow: '#c27d00', brightBlue: '#5285d6', brightMagenta: '#d4569d', brightCyan: '#33a5ab', brightWhite: '#6b4f70',
      },
    },
  },
};

// ---------- Bilinen temalar ----------
// Yalnızca temel renkler yazılır; sekme/çubuk/kenar renkleri bunlardan türetilir.
// [zemin, yazı, seçim, vurgu, [siyah, kırmızı, yeşil, sarı, mavi, mor, camgöbeği, beyaz], parlaklar?]
(() => {
  const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

  function build(light, [bg, fg, sel, accent, normal, bright]) {
    const dim = mix(fg, bg, light ? 0.42 : 0.45);
    const term = { background: bg, foreground: fg, cursor: accent, cursorAccent: bg, selectionBackground: sel };
    ANSI.forEach((n, i) => {
      term[n] = normal[i];
      const b = bright?.[i] ?? mix(normal[i], '#ffffff', light ? 0.12 : 0.2);
      term['bright' + n[0].toUpperCase() + n.slice(1)] = b;
    });
    if (light) {
      // Açık zeminde "beyaz" yazılar görünmez olur; koyu tut
      term.white = dim;
      term.brightWhite = mix(fg, bg, 0.15);
    }
    const ui = light
      ? { bg, bar: mix(bg, fg, 0.05), tab: mix(bg, fg, 0.09), tabActive: bg, fg, dim, accent, border: mix(bg, fg, 0.14) }
      : { bg, bar: mix(bg, '#000000', 0.2), tab: mix(bg, fg, 0.07), tabActive: bg, fg, dim, accent, border: mix(bg, fg, 0.13) };
    return { ui, term };
  }

  const add = (key, name, dark, light, group = 'Bilinen temalar') => {
    window.KABUK_THEMES[key] = { name, group, dark: build(false, dark), light: build(true, light) };
  };
  // Kabuk'un kendi temaları (listede "Kabuk temaları" altında, adları çevrilir)
  const own = (key, name, dark, light) => add(key, name, dark, light, null);

  own('kehribar', 'Kehribar', // eski kehribar ekranlı monitör
    ['#140c02', '#ffb000', '#4a3000', '#ffb000', ['#2a1a00', '#ff7a1a', '#e8d040', '#ffd966', '#e6a000', '#ff9a40', '#ffc04d', '#ffd38a'], ['#6b4a10', '#ff9a4d', '#f2e070', '#ffe699', '#ffbb33', '#ffb370', '#ffd480', '#fff0d0']],
    ['#fdf6e8', '#7a4a00', '#f3ddb0', '#c77700', ['#4a2c00', '#b84a00', '#6f7a00', '#a06800', '#c77700', '#a8501a', '#8f6a1f', '#9a7a50']]);
  own('neon', 'Neon', // gece kulübü: koyu mor zemin, pembe ve camgöbeği
    ['#13091f', '#f2e8ff', '#3d1f5c', '#ff2fa8', ['#241338', '#ff3d7f', '#3dffb0', '#ffe94d', '#36c9ff', '#ff2fa8', '#2ff3e0', '#e0d0f5'], ['#5a3d7a', '#ff6e9e', '#7affc9', '#fff27a', '#6fd8ff', '#ff66c4', '#6ff7ea', '#ffffff']],
    ['#fbf5ff', '#2a1440', '#f0d4f7', '#d4147f', ['#2a1440', '#d4143f', '#0a8f5a', '#9a7a00', '#0a76c4', '#c2147a', '#0a8f8a', '#7a6a90']]);
  own('murekkep', 'Mürekkep', // neredeyse renksiz: gri tonlar + tek kırmızı vurgu
    ['#111111', '#d4d4d4', '#333333', '#e5484d', ['#262626', '#e5484d', '#a3c2a3', '#e0d6b8', '#9eaabd', '#c4b4c4', '#adbdbd', '#d4d4d4'], ['#5c5c5c', '#ff6b6f', '#bdd6bd', '#f0e8cc', '#b8c2d4', '#d8cad8', '#c6d4d4', '#ffffff']],
    ['#f7f5f0', '#1a1a1a', '#dedad0', '#c4252b', ['#1a1a1a', '#c4252b', '#3f6b3f', '#7a6420', '#3a4f70', '#6a4a6a', '#3f6464', '#6e6e6e']]);
  own('lav', 'Lav', // sıcak: koyu kızıl zemin, turuncu vurgu
    ['#1a0d0b', '#f2dcd2', '#4a1f17', '#ff5a2e', ['#2b1612', '#ff4f3a', '#b8d26a', '#ffb02e', '#7fa6d6', '#ff6f8f', '#f2a07a', '#e6cfc4']],
    ['#fff5f0', '#4a1a10', '#fbd3c4', '#d9381e', ['#4a1a10', '#c62a12', '#5f7a12', '#a85e00', '#2f5f9a', '#b8285a', '#a8501f', '#8a6a60']]);


  add('catppuccin', 'Catppuccin',
    ['#1e1e2e', '#cdd6f4', '#45475a', '#cba6f7', ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'], ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8']],
    ['#eff1f5', '#4c4f69', '#ccd0da', '#8839ef', ['#5c5f77', '#d20f39', '#40a02b', '#c47a12', '#1e66f5', '#ea76cb', '#179299', '#6c6f85']]);
  add('everforest', 'Everforest',
    ['#2d353b', '#d3c6aa', '#475258', '#a7c080', ['#475258', '#e67e80', '#a7c080', '#dbbc7f', '#7fbbb3', '#d699b6', '#83c092', '#d3c6aa'], ['#859289', '#f09294', '#b8cf92', '#e5c992', '#93c9c1', '#e2aec6', '#97cea6', '#e9e0cb']],
    ['#fdf6e3', '#5c6a72', '#e6e2cc', '#8da101', ['#5c6a72', '#f85552', '#8da101', '#c08a00', '#3a94c5', '#df69ba', '#35a77c', '#939f91']]);
  add('kanagawa', 'Kanagawa',
    ['#1f1f28', '#dcd7ba', '#2d4f67', '#7e9cd8', ['#16161d', '#c34043', '#76946a', '#c0a36e', '#7e9cd8', '#957fb8', '#6a9589', '#c8c093'], ['#727169', '#e82424', '#98bb6c', '#e6c384', '#7fb4ca', '#938aa9', '#7aa89f', '#dcd7ba']],
    ['#f2ecbc', '#545464', '#c9cbd1', '#4d699b', ['#1f1f28', '#c84053', '#6f894e', '#77713f', '#4d699b', '#b35b79', '#597b75', '#8a8980']]);
  add('monokai', 'Monokai Pro',
    ['#2d2a2e', '#fcfcfa', '#5b595c', '#ffd866', ['#403e41', '#ff6188', '#a9dc76', '#ffd866', '#fc9867', '#ab9df2', '#78dce8', '#fcfcfa'], ['#727072', '#ff7a9b', '#bce58f', '#ffe085', '#fdab84', '#beb3f5', '#93e4ed', '#ffffff']],
    ['#f8efe7', '#2c232e', '#d2c9c4', '#b16803', ['#2c232e', '#ce4770', '#218871', '#b16803', '#e16032', '#6851a2', '#2473b6', '#72696d']]);
  add('nord', 'Nord',
    ['#2e3440', '#d8dee9', '#434c5e', '#88c0d0', ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'], ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4']],
    ['#eceff4', '#2e3440', '#d8dee9', '#5e81ac', ['#3b4252', '#b5404a', '#4f7a35', '#9a6a00', '#5e81ac', '#8a5a85', '#2f7f8f', '#616e88']]);
  add('solarized', 'Solarized',
    ['#002b36', '#93a1a1', '#073642', '#268bd2', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'], ['#657b83', '#cb4b16', '#9fb51a', '#d4a10a', '#4aa3e0', '#6c71c4', '#3fbfb3', '#fdf6e3']],
    ['#fdf6e3', '#586e75', '#eee8d5', '#268bd2', ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#93a1a1'], ['#657b83', '#cb4b16', '#6f8000', '#9a7400', '#1f76b4', '#6c71c4', '#21877f', '#586e75']]);
})();
