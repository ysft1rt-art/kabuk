'use strict';
// Eğlence katmanı: terminalin üstünde çizilen animasyonlu emojiler ve boş satır ipucu

// Kelimeler Türkçe harfsiz ve küçük harfle yazılır; funScene yazılanı aynı hale getirip bakar
// İki dildeki kelimeler de her zaman çalışır
const FUN_WORDS = {
  kedi: 'kedi', kopek: 'kopek', kus: 'kus', balik: 'balik', kar: 'kar',
  fisek: 'fisek', 'havai fisek': 'fisek', kalp: 'kalp',
  cat: 'kedi', dog: 'kopek', bird: 'kus', fish: 'balik', snow: 'kar',
  fireworks: 'fisek', firework: 'fisek', heart: 'kalp',
};
const TR_PLAIN = { ı: 'i', ş: 's', ç: 'c', ğ: 'g', ö: 'o', ü: 'u' };

// "Kedi", "KEDİ", "KEDI", " kedi " hepsi aynı kelime sayılır
function funScene(text) {
  const word = text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr').replace(/[ışçğöü]/g, (c) => TR_PLAIN[c]);
  return Object.hasOwn(FUN_WORDS, word) ? FUN_WORDS[word] : null;
}
const FUN_HINT = '✨ eğlence için yaz: kedi · köpek · kuş · balık · kar · fişek · kalp';

// Yeni açılan terminalde, henüz bir şey yazılmamışken boş satırda sırayla akan komut önerileri
const TIPS = {
  powershell: [
    ['claude', "Claude Code'u başlatır"],
    ['ls', 'bu klasördeki dosyaları listeler'],
    ['cd ..', 'bir üst klasöre çıkar'],
    ['cd Desktop', 'Masaüstüne gider'],
    ['explorer .', "bu klasörü Dosya Gezgini'nde açar"],
    ['code .', "bu klasörü VS Code'da açar"],
    ['cls', 'ekranı temizler'],
    ['mkdir yeni-klasor', 'yeni bir klasör oluşturur'],
    ['notepad notlar.txt', "dosyayı Not Defteri'nde açar"],
    ['git status', "Git'te nelerin değiştiğini gösterir"],
    ['winget upgrade', 'güncellenebilecek programları listeler'],
    ['ipconfig', 'ağ bilgilerini gösterir'],
    ['ping google.com', 'internet bağlantısını dener'],
    ['Get-Process', 'çalışan programları listeler'],
    ['history', 'daha önce yazdığın komutları gösterir'],
  ],
  cmd: [
    ['claude', "Claude Code'u başlatır"],
    ['dir', 'bu klasördeki dosyaları listeler'],
    ['cd ..', 'bir üst klasöre çıkar'],
    ['cd Desktop', 'Masaüstüne gider'],
    ['explorer .', "bu klasörü Dosya Gezgini'nde açar"],
    ['code .', "bu klasörü VS Code'da açar"],
    ['cls', 'ekranı temizler'],
    ['mkdir yeni-klasor', 'yeni bir klasör oluşturur'],
    ['notepad notlar.txt', "dosyayı Not Defteri'nde açar"],
    ['git status', "Git'te nelerin değiştiğini gösterir"],
    ['winget upgrade', 'güncellenebilecek programları listeler'],
    ['ipconfig', 'ağ bilgilerini gösterir'],
    ['ping google.com', 'internet bağlantısını dener'],
    ['tasklist', 'çalışan programları listeler'],
  ],
  bash: [
    ['claude', "Claude Code'u başlatır"],
    ['ls -la', 'bu klasördeki her şeyi listeler'],
    ['cd ..', 'bir üst klasöre çıkar'],
    ['pwd', 'hangi klasörde olduğunu gösterir'],
    ['explorer .', "bu klasörü Dosya Gezgini'nde açar"],
    ['code .', "bu klasörü VS Code'da açar"],
    ['clear', 'ekranı temizler'],
    ['mkdir yeni-klasor', 'yeni bir klasör oluşturur'],
    ['cat notlar.txt', 'dosyanın içini ekrana yazar'],
    ['git status', "Git'te nelerin değiştiğini gösterir"],
    ['git log --oneline', 'son kayıtları (commit) listeler'],
    ['ping google.com', 'internet bağlantısını dener'],
    ['history', 'daha önce yazdığın komutları gösterir'],
  ],
};
const TIP_EVERY = 1700; // ms: bir öneri ne kadar ekranda kalır

// Boş komut satırı: PowerShell (PS C:\...>), cmd (C:\...>), bash ($ / #)
const PROMPT_RE = /^(PS [^>]*>|[A-Za-z]:\\[^>]*>|.*[$#])$/;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class FunLayer {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fun-canvas';
    this.hint = document.createElement('div');
    this.hint.className = 'fun-hint';
    this.hint.textContent = t(FUN_HINT);
    this.hint.hidden = true;
    this.tips = document.createElement('div');
    this.tips.className = 'cmd-tips';
    this.tips.hidden = true;
    this.tipList = null;
    this.tipQueue = [];
    this.tipTimer = null;
    host.append(this.canvas, this.hint, this.tips);
    this.ctx = this.canvas.getContext('2d');
    this.sprites = [];
    this.running = false;
  }

  // ---------- Animasyon döngüsü ----------
  play(scene) {
    this.resize();
    SCENES[scene]?.(this);
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((now) => this.frame(now));
    }
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = this.host.clientWidth;
    this.h = this.host.clientHeight;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  add(s) {
    this.sprites.push({ vx: 0, vy: 0, g: 0, age: 0, size: 32, rot: 0, vr: 0, alpha: 1, ...s });
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const born = [];
    for (const s of this.sprites) {
      s.age += dt;
      s.vy += s.g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      s.update?.(s, dt, born);
      if (s.life) s.alpha = Math.max(0, Math.min(1, (s.life - s.age) / (s.life * 0.35)));
      this.draw(s);
    }
    const m = 160;
    // Ekran dışından girenler silinmesin: yalnızca hareket yönünde dışarı çıkanları at
    const gone = (s) => s.dead || (s.life && s.age >= s.life) ||
      (s.vx < 0 && s.x < -m) || (s.vx > 0 && s.x > w + m) ||
      (s.vy > 0 && s.y > h + m) || (s.vy < 0 && s.y < -h - m);
    this.sprites = this.sprites.filter((s) => !gone(s));
    this.sprites.push(...born);
    if (this.sprites.length) requestAnimationFrame((now) => this.frame(now));
    else { this.running = false; ctx.clearRect(0, 0, w, h); }
  }

  draw(s) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.translate(s.x, s.y + (s.bob ? Math.sin(s.age * s.bob.f + (s.bob.p || 0)) * s.bob.a : 0));
    ctx.rotate(s.rot);
    if (s.flap) ctx.scale(1, 0.75 + 0.25 * Math.abs(Math.sin(s.age * s.flap)));
    if (s.flip) ctx.scale(-1, 1);
    if (s.dot) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(0, 0, s.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (s.ring) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, s.size, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.font = `${s.size}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.emoji, 0, 0);
    }
    ctx.restore();
  }

  // ---------- Boş satır ipucu ----------
  showHint(x, y, cellH, font, maxW) {
    place(this.hint, x, y, cellH, font);
    this.hint.textContent = t(FUN_HINT);   // dil değişmiş olabilir
    this.hint.style.maxWidth = Math.max(0, maxW) + 'px';
    this.hint.hidden = maxW < 60;
  }

  hideHint() {
    this.hint.hidden = true;
    this.hideTips();
  }

  // ---------- Akan komut önerileri ----------
  showTips(kind, x, y, cellH, font, maxW) {
    place(this.tips, x, y, cellH, font);
    this.tips.style.width = Math.max(0, maxW) + 'px';
    if (maxW < 60) { this.hideTips(); return; }
    const list = TIPS[kind] || TIPS.powershell;
    if (list !== this.tipList || LANG !== this.tipLang) {
      this.tipList = list;
      this.tipLang = LANG;
      this.tipQueue = [];
      this.tips.replaceChildren();
    }
    this.tips.hidden = false;
    if (!this.tips.firstChild) this.nextTip();
    if (!this.tipTimer) this.tipTimer = setInterval(() => this.nextTip(), TIP_EVERY);
  }

  hideTips() {
    this.tips.hidden = true;
    clearInterval(this.tipTimer);
    this.tipTimer = null;
  }

  // Eskisi yukarı kayıp kaybolur, yenisi aşağıdan gelir. Liste karışık sırayla, tekrarsız döner
  nextTip() {
    if (!this.tipQueue.length) this.tipQueue = shuffle([...this.tipList]);
    const [cmd, desc] = this.tipQueue.pop();
    const el = document.createElement('div');
    el.className = 'cmd-tip';
    const c = document.createElement('span');
    c.className = 'cmd-tip-cmd';
    c.textContent = tq(cmd);   // "mkdir yeni-klasor" → "mkdir new-folder"
    el.append(t('💡 dene: '), c, '  · ' + t(desc));
    const old = this.tips.querySelectorAll('.cmd-tip:not(.out)');
    old.forEach((o) => { o.classList.add('out'); setTimeout(() => o.remove(), 400); });
    this.tips.append(el);
  }
}

function place(el, x, y, cellH, font) {
  const st = el.style;
  st.left = x + 'px';
  st.top = y + 'px';
  st.height = cellH + 'px';
  st.lineHeight = cellH + 'px';
  st.font = font;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Sahneler ----------
const SCENES = {
  // Kedi yün yumağını kovalar
  kedi(L) {
    const y = L.h - 40;
    L.add({ emoji: '🧶', x: L.w + 40, y: y + 8, vx: -150, vr: -6, size: 26 });
    L.add({ emoji: '🐈', x: L.w + 130, y, vx: -150, size: 46, bob: { a: 3, f: 14 } });
    L.add({ emoji: '🐈‍⬛', x: L.w + 320, y, vx: -165, size: 38, bob: { a: 3, f: 16, p: 1 } });
  },

  // Köpek kemiğin peşinde hoplayarak koşar, arkasında toz bırakır
  kopek(L) {
    const ground = L.h - 40;
    L.add({ emoji: '🦴', x: L.w + 30, y: ground - 60, vx: -230, vr: 8, size: 26 });
    L.add({
      emoji: '🐕', x: L.w + 160, y: ground, vx: -230, size: 50,
      update(s, dt, born) {
        s.y = ground - Math.abs(Math.sin(s.age * 7)) * 45;
        s.dust = (s.dust || 0) + dt;
        if (s.dust > 0.18 && s.y > ground - 6) {
          s.dust = 0;
          born.push({ emoji: '💨', x: s.x + 30, y: ground + 8, vx: 40, vy: -10, size: 20, life: 0.6, age: 0, g: 0, rot: 0, vr: 0, alpha: 1 });
        }
      },
    });
  },

  // Kanat çırpan kuş sürüsü
  kus(L) {
    for (let i = 0; i < 7; i++) {
      L.add({
        emoji: pick(['🐦', '🐦', '🕊️', '🐤']), x: L.w + rand(20, 400), y: rand(30, L.h * 0.55),
        vx: -rand(140, 230), size: rand(24, 40), flap: rand(14, 20), bob: { a: rand(8, 22), f: rand(2, 4), p: rand(0, 6) },
      });
    }
  },

  // Balıklar yüzer, kabarcık çıkarır
  balik(L) {
    for (let i = 0; i < 6; i++) {
      L.add({
        emoji: pick(['🐟', '🐠', '🐡']), x: L.w + rand(20, 450), y: rand(L.h * 0.25, L.h - 40),
        vx: -rand(80, 150), size: rand(28, 44), bob: { a: rand(6, 14), f: rand(2, 3.5), p: rand(0, 6) },
        update(s, dt, born) {
          s.bub = (s.bub || rand(0, 0.5)) - dt;
          if (s.bub <= 0) {
            s.bub = rand(0.4, 1);
            born.push({ ring: true, color: 'rgba(140,200,255,.8)', x: s.x - s.size / 2, y: s.y, vx: rand(-8, 8), vy: -rand(40, 70), size: rand(2, 5), life: rand(1.2, 2), age: 0, g: 0, rot: 0, vr: 0, alpha: 1 });
          }
        },
      });
    }
  },

  // Kar yağışı
  kar(L) {
    for (let i = 0; i < 70; i++) {
      L.add({
        emoji: pick(['❄️', '❅', '❆']), x: rand(0, L.w), y: -rand(10, L.h * 0.9),
        vy: rand(35, 80), vr: rand(-1, 1), size: rand(12, 26), life: rand(6, 9),
        bob: { a: rand(5, 15), f: rand(1, 2), p: rand(0, 6) },
      });
    }
  },

  // Havai fişek: roket yükselir, renkli parçacıklara patlar
  fisek(L) {
    const colors = ['#ff5f6d', '#ffc371', '#7afcff', '#b388ff', '#69f0ae', '#ffffff', '#ff80ab'];
    for (let i = 0; i < 4; i++) {
      const color = pick(colors);
      L.add({
        dot: true, color, size: 2.5, x: rand(L.w * 0.15, L.w * 0.85), y: L.h + 10 + i * 60,
        vy: -rand(330, 420), g: 180, explodeAt: rand(L.h * 0.15, L.h * 0.45),
        update(s, dt, born) {
          born.push({ dot: true, color, size: 1.5, x: s.x, y: s.y + 4, vx: 0, vy: 30, life: 0.35, age: 0, g: 0, rot: 0, vr: 0, alpha: 1 });
          if (s.y <= s.explodeAt || s.vy >= 0) {
            s.dead = true;
            const n = 48;
            for (let k = 0; k < n; k++) {
              const a = (k / n) * Math.PI * 2, sp = rand(80, 190);
              born.push({ dot: true, color: Math.random() < 0.2 ? '#ffffff' : color, size: rand(1.5, 2.8), x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 90, life: rand(1, 1.8), age: 0, rot: 0, vr: 0, alpha: 1 });
            }
          }
        },
      });
    }
  },

  // Kalpler aşağıdan süzülerek yükselir
  kalp(L) {
    for (let i = 0; i < 18; i++) {
      L.add({
        emoji: pick(['💖', '💗', '💕', '❤️', '💜', '💙']), x: rand(20, L.w - 20), y: L.h + rand(10, 260),
        vy: -rand(60, 120), size: rand(18, 34), life: rand(4, 6), bob: { a: rand(6, 16), f: rand(1.5, 3), p: rand(0, 6) },
      });
    }
  },
};

window.KabukFun = { FunLayer, FUN_WORDS, PROMPT_RE, funScene };
