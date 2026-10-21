'use strict';

// Otomatik güncelleme (electron-updater). Yeni sürümler GitHub'daki "Releases" sayfasından gelir
// (package.json > build.publish). Yalnızca kurulum dosyasıyla kurulan Kabuk'ta çalışır; geliştirme
// klasöründen (electron.exe ile) açılan Kabuk'ta durum "unsupported" olur.
//
// Akış: kontrol → yeni sürüm varsa arka planda indirilir → üst çubukta "Güncelle" düğmesi çıkar →
// kullanıcı basınca Kabuk kapanır, yeni sürüm sessizce kurulur ve Kabuk yeniden açılır.
// Kullanıcı basmadan Kabuk'u kapatırsa yeni sürüm kapanırken kurulur (autoInstallOnAppQuit).
//
// Renderer'a giden durum: { state, current, version, percent, notes, error, manual, checkedAt }
//   state: idle · checking · none (güncel) · downloading · ready · error · unsupported

const { app } = require('electron');

const FIRST_CHECK_MS = 30 * 1000;          // açılıştan sonra ilk kontrol
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000; // sonra 4 saatte bir

// Test için: geliştirme klasöründe KABUK_UPDATE_CONFIG=<app-update.yml> verilirse o kaynak kullanılır
const DEV_CONFIG = !app.isPackaged ? process.env.KABUK_UPDATE_CONFIG : null;

function createUpdater({ send, beforeInstall }) {
  const supported = app.isPackaged || !!DEV_CONFIG;
  let status = { state: supported ? 'idle' : 'unsupported', current: app.getVersion() };
  let auto = false;
  let firstTimer = null;
  let everyTimer = null;
  let lastProgress = 0;
  let updater = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    send(status);
  };

  // GitHub sürüm notları HTML gelir; düğmenin penceresinde düz yazı olarak gösterilir
  function plainNotes(notes) {
    if (Array.isArray(notes)) notes = notes.map((n) => n.note || '').join('\n');
    if (typeof notes !== 'string') return '';
    return notes
      .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 1500);
  }

  function errorText(err) {
    const s = String(err?.message || err || '');
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EAI_AGAIN|net::ERR_/i.test(s)) return 'offline';
    // GitHub'da henüz yayınlanmış sürüm (ya da sürümde latest.yml) yok
    if (/No published versions|Unable to find latest version|Cannot find latest\.yml|404/i.test(s)) return 'no-release';
    return s.split('\n')[0].slice(0, 200);
  }

  function get() {
    if (updater || !supported) return updater;
    ({ autoUpdater: updater } = require('electron-updater'));
    updater.autoDownload = true;           // yeni sürüm bulununca arka planda indir
    updater.autoInstallOnAppQuit = true;   // düğmeye basılmasa da Kabuk kapanırken kur
    updater.allowPrerelease = false;
    updater.logger = null;
    if (DEV_CONFIG) {
      updater.forceDevUpdateConfig = true;
      updater.updateConfigPath = DEV_CONFIG;
    }
    updater.on('update-available', (info) => {
      lastProgress = 0;
      set({ state: 'downloading', version: info.version, notes: plainNotes(info.releaseNotes), percent: 0, error: null });
    });
    updater.on('update-not-available', () => set({ state: 'none', checkedAt: Date.now(), error: null }));
    updater.on('download-progress', (p) => {
      const percent = Math.floor(p.percent || 0);
      if (percent === lastProgress) return;   // her küçük parçada değil, yüzde değişince gönder
      lastProgress = percent;
      set({ state: 'downloading', percent });
    });
    updater.on('update-downloaded', (info) => {
      set({ state: 'ready', version: info.version, notes: plainNotes(info.releaseNotes) || status.notes, percent: 100, error: null });
    });
    updater.on('error', (err) => {
      if (status.state === 'ready') return;
      set({ state: 'error', error: errorText(err), checkedAt: Date.now() });
    });
    return updater;
  }

  // manual: kullanıcı Ayarlar'dan bastı (hata olursa orada gösterilir; otomatikte sessiz kalır)
  async function check(manual = false) {
    if (!supported) return status;
    // İndirme sürerken ya da yeni sürüm hazırken tekrar bakmaya gerek yok
    if (['checking', 'downloading', 'ready'].includes(status.state)) return status;
    set({ state: 'checking', manual, error: null });
    try {
      await get().checkForUpdates();
    } catch (err) {
      if (status.state !== 'ready') set({ state: 'error', error: errorText(err), checkedAt: Date.now() });
    }
    // Kontrol bitti ama hiçbir olay gelmediyse (örn. kaynak boş) "checking"de takılı kalmasın
    if (status.state === 'checking') set({ state: 'none', checkedAt: Date.now() });
    return status;
  }

  // Ayarlardaki "Otomatik denetle" anahtarı
  function setAuto(on) {
    if (!supported || on === auto) return;
    auto = on;
    clearTimeout(firstTimer);
    clearInterval(everyTimer);
    if (!on) return;
    firstTimer = setTimeout(() => check(false), FIRST_CHECK_MS);
    everyTimer = setInterval(() => check(false), CHECK_EVERY_MS);
  }

  // "Yeniden başlat ve güncelle": Kabuk kapanır, kurulum sessizce çalışır, Kabuk yeniden açılır
  function install() {
    if (status.state !== 'ready' || !updater) return false;
    beforeInstall();
    setImmediate(() => updater.quitAndInstall(true, true));
    return true;
  }

  return { check, setAuto, install, status: () => status };
}

module.exports = { createUpdater };
