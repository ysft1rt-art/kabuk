'use strict';

// Windows sağ tık menüsü ("Kabuk ile aç"): kurulu araçları bulma, menüyü kurma/kaldırma.
// main.js kullanır; Electron'a bağlı değil (test betikleri doğrudan çağırabilir).
//
// İki yol var:
//  1) Windows 11'in kısa menüsü: KabukMenu.dll (IExplorerCommand) + kimlik paketi KabukMenu.msix.
//     Paket "CN=Kabuk" ile imzalı; Windows'un bu imzaya güvenmesi için KabukMenu.cer bir kez
//     LocalMachine\TrustedPeople'a eklenmeli. Bunu kullanıcı Ayarlar'daki düğmeyle yapar (yönetici onayı, trust()).
//     Güven varsa paket bu kullanıcı için yönetici gerekmeden kurulur.
//  2) Eski menü ("Diğer seçenekleri göster"): HKCU kayıt defteri girdileri. Yalnızca kısa menü yokken
//     yazılır: kısa menüdeki eklenti "Diğer seçenekler"de zaten kendiliğinden görünür, ikisi birden olunca
//     orada iki kez çıkıyor. Bulunan araçlar her eşitlemede yeniden yazılır.
// Hepsi yalnızca bu kullanıcı için; menü kapatılınca paket ve girdiler silinir (sertifika güveni kalır,
// gizli anahtarı olmadığı için zararsız).

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

// Kurulum dosyasıyla kurulan Kabuk'ta bu dosya app.asar paketinin içindedir; menü dosyaları (DLL, paket,
// sertifika, clis.txt) ise Windows'un okuyabilmesi için paketin dışında: <kurulum>\contextmenu
const INSTALLED = __dirname.includes('app.asar');
const DIR = INSTALLED ? path.join(path.dirname(process.execPath), 'contextmenu') : __dirname;
const PACKAGE = 'Kabuk.ContextMenu';
const PACKAGE_VERSION = '1.0.3.0';   // package/AppxManifest.xml ile aynı
// Kurulu sürümün paketinde Executable = Kabuk.exe, geliştirme klasörününkinde electron.exe (build.ps1)
const MSIX = path.join(DIR, INSTALLED ? 'KabukMenu-app.msix' : 'KabukMenu.msix');
const CER = path.join(DIR, 'KabukMenu.cer');
const CLASSIC_KEYS = ['Directory\\shell\\Kabuk', 'Directory\\Background\\shell\\Kabuk', 'Drive\\shell\\Kabuk']
  .map((k) => `HKCU:\\Software\\Classes\\${k}`);

// ---------- Araçlar (clis.txt) ----------
// "komut | ad" satırları. Komut adı yalnızca harf/rakam/-/_/. (komut satırına güvenle yazılsın)
function readCliList() {
  let text = '';
  try { text = fs.readFileSync(path.join(DIR, 'clis.txt'), 'utf8'); } catch { return []; }
  const list = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('|')) continue;
    const [cmd, ...rest] = line.split('|');
    const c = { cmd: cmd.trim(), name: rest.join('|').trim() };
    if (/^[\w.-]+$/.test(c.cmd) && c.name) list.push(c);
  }
  return list;
}

// PATH'te bulunan araçlar (menü eklentisi de aynı aramayı her açılışta kendisi yapar)
// Her klasör bir kez okunur (araç × klasör × uzantı başına ayrı dosya sorgusu ~2500 sorgu ve 150 ms sürüyordu)
function detectClis(envPath = process.env.PATH || '') {
  const dirs = [...new Set(envPath.split(';').map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean))];
  const listing = dirs.map((d) => {
    try { return new Set(fs.readdirSync(d).map((n) => n.toLowerCase())); } catch { return new Set(); }
  });
  const found = [];
  for (const c of readCliList()) {
    let file = null;
    for (let i = 0; i < dirs.length && !file; i++) {
      for (const e of ['.exe', '.cmd', '.bat', '.ps1', '.com']) {
        if (!listing[i].has((c.cmd + e).toLowerCase())) continue;
        const f = path.join(dirs[i], c.cmd + e);
        try { if (fs.statSync(f).isFile()) { file = f; break; } } catch {}
      }
    }
    if (file) found.push({ ...c, file });
  }
  return found;
}

// ---------- PowerShell ----------
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
// Yalnızca kısa komutlar için (yönetici penceresine giden tek satır). Base64 komutu ~2,7 kat uzatır
const encode = (script) => Buffer.from(`$ProgressPreference='SilentlyContinue'\n${script}`, 'utf16le').toString('base64');

// Betik geçici bir dosyaya yazılır, komut satırına yalnızca "bu dosyayı oku ve çalıştır" gider.
// Betiği doğrudan komut satırına gömünce (-EncodedCommand) çok araç kurulu bilgisayarlarda Windows'un
// 32.767 karakterlik sınırı aşılıyordu (spawn ENAMETOOLONG; 5 araçta sınırdaydı).
// -File yerine scriptblock: şirket bilgisayarlarında grup ilkesi betik dosyası çalıştırmayı yasaklamış olabilir
function powershell(script, timeout = 90000) {
  return new Promise((resolve) => {
    const file = path.join(os.tmpdir(), `kabuk-menu-${process.pid}-${crypto.randomUUID()}.ps1`);
    try {
      fs.writeFileSync(file, script, 'utf8');
    } catch (err) {
      resolve({ ok: false, out: '', err: String(err) });
      return;
    }
    // Çıktı UTF-8 olsun: yoksa Türkçe hata mesajları Ayarlar'da bozuk harflerle görünür
    const boot = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
& ([scriptblock]::Create([IO.File]::ReadAllText(${psq(file)}, [Text.Encoding]::UTF8)))`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(boot)],
      { windowsHide: true, timeout, encoding: 'utf8' },
      (err, stdout, stderr) => {
        try { fs.rmSync(file, { force: true }); } catch {}
        // Hata mesajında komut satırının tamamı (uzun base64) olmasın
        const msg = String(stderr || '').trim() || (err ? (err.killed ? 'zaman aşımı' : `çıkış kodu ${err.code}`) : '');
        resolve({ ok: !err, out: String(stdout || '').trim(), err: msg });
      });
  });
}

// ---------- Eski menü ----------
// Kurulu sürüm: Kabuk.exe ... · geliştirme klasörü: electron.exe "<kabuk>" ...
function menuCommand(ctx, run) {
  const app = INSTALLED ? '' : ` "${ctx.appDir}"`;
  return `"${ctx.exe}"${app}${run ? ` --kabuk-run=${run}` : ''} "--kabuk-dir=%V"`;
}

function classicScript(ctx, install, clis = []) {
  const lines = [`foreach ($k in @(${CLASSIC_KEYS.map(psq).join(',')})) { if (Test-Path -LiteralPath $k) { Remove-Item -LiteralPath $k -Recurse -Force } }`];
  if (!install) return lines.join('\n');
  const icon = path.join(ctx.appDir, 'assets', 'icon.ico');
  const prop = (key, name, value, type) =>
    `New-ItemProperty -LiteralPath ${psq(key)} -Name ${name} -Value ${value}${type ? ` -PropertyType ${type}` : ''} -Force | Out-Null`;
  for (const k of CLASSIC_KEYS) {
    lines.push(`New-Item -Path ${psq(k)} -Force | Out-Null`);
    lines.push(prop(k, 'MUIVerb', psq(ctx.label)));
    lines.push(prop(k, 'Icon', psq(icon)));
    if (!clis.length) {
      lines.push(`New-Item -Path ${psq(k + '\\command')} -Value ${psq(menuCommand(ctx, null))} -Force | Out-Null`);
      continue;
    }
    // Alt menü: en üstte Terminal (ardından ayraç), sonra bulunan araçlar; simgesiz (simge yalnızca ana satırda)
    lines.push(prop(k, 'SubCommands', "''"));
    const items = [
      { name: 'Terminal', run: null, sepAfter: true },
      ...clis.map((c) => ({ name: c.name, run: c.cmd })),
    ];
    items.forEach((it, i) => {
      const sub = `${k}\\shell\\${String(i + 1).padStart(2, '0')}`;
      lines.push(`New-Item -Path ${psq(sub)} -Force | Out-Null`);
      lines.push(prop(sub, 'MUIVerb', psq(it.name)));
      if (it.sepAfter) lines.push(prop(sub, 'CommandFlags', '0x40', 'DWord'));   // ECF_SEPARATORAFTER
      lines.push(`New-Item -Path ${psq(sub + '\\command')} -Value ${psq(menuCommand(ctx, it.run))} -Force | Out-Null`);
    });
  }
  return lines.join('\n');
}

// ---------- Eşitleme ----------
// ctx: { appDir, exe, label ("Kabuk ile aç"), readState(), writeState(patch) }
// Dönüş: { state: 'modern' | 'classic' | 'error' | 'off', needsTrust, clis: [ad], error }
async function sync(ctx, want) {
  const clis = detectClis();
  const names = clis.map((c) => c.name);
  if (!want) {
    await powershell(`Get-AppxPackage -Name ${psq(PACKAGE)} | Remove-AppxPackage\n${classicScript(ctx, false)}`);
    ctx.writeState({ menuInstalled: null });
    return { state: 'off', clis: names };
  }

  // Sertifikaya güveniliyor mu, paket kurulu mu?
  const probe = await powershell(`$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 ${psq(CER)}
'thumb=' + $c.Thumbprint
'trusted=' + (Test-Path ('Cert:\\LocalMachine\\TrustedPeople\\' + $c.Thumbprint))
$p = Get-AppxPackage -Name ${psq(PACKAGE)}
'version=' + $p.Version`);
  const val = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(probe.out) || [])[1]?.trim() || '';
  const thumb = val('thumb');
  const trusted = val('trusted') === 'True';
  const installed = val('version');

  if (trusted && thumb) {
    // Aynı sürüm, aynı imza, aynı klasörden zaten kuruluysa dokunma; değiştiyse yeniden kur
    const key = `${PACKAGE_VERSION}|${thumb}|${ctx.appDir}`;
    let ok = installed === PACKAGE_VERSION && ctx.readState().menuInstalled === key;
    let error = '';
    if (!ok) {
      const r = await powershell(`$ErrorActionPreference = 'Stop'
try {
  Get-AppxPackage -Name ${psq(PACKAGE)} | Remove-AppxPackage
  Add-AppxPackage -Path ${psq(MSIX)} -ExternalLocation ${psq(ctx.appDir)}
  'ok'
} catch { 'fail: ' + $_.Exception.Message; exit 1 }`);
      ok = r.ok && r.out.endsWith('ok');
      error = ok ? '' : (r.out || r.err).replace(/^fail: /, '');
    }
    if (ok) {
      ctx.writeState({ menuInstalled: key });
      // Windows kısa menüdeki eklentiyi "Diğer seçenekleri göster" altına da kendisi koyar;
      // eski girdiler kalırsa orada iki "Kabuk ile aç" görünür. O yüzden silinir
      const rm = await powershell(classicScript(ctx, false));
      if (!rm.ok) return { state: 'modern', clis: names, error: rm.err };
      return { state: 'modern', clis: names };
    }
    ctx.writeState({ menuInstalled: null });
    const c = await powershell(classicScript(ctx, true, clis));
    return c.ok ? { state: 'classic', clis: names, error } : { state: 'error', clis: names, error: c.err || error };
  }

  // Güven yok: eski menü (kısa menü için kullanıcının düğmeye basması gerekir)
  if (installed) await powershell(`Get-AppxPackage -Name ${psq(PACKAGE)} | Remove-AppxPackage`);
  ctx.writeState({ menuInstalled: null });
  const c = await powershell(classicScript(ctx, true, clis));
  return c.ok ? { state: 'classic', needsTrust: true, clis: names } : { state: 'error', needsTrust: true, clis: names, error: c.err };
}

// Kabuk sertifikasını Windows'un güvenilen kişiler listesine ekler. Yönetici onayı (UAC) ister:
// kullanıcı Ayarlar'daki düğmeye basınca çalışır. Dönüş: 'done' | 'canceled'
async function trust() {
  const inner = encode(`Import-Certificate -FilePath ${psq(CER)} -CertStoreLocation Cert:\\LocalMachine\\TrustedPeople | Out-Null`);
  const r = await powershell(`try {
  $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',${psq(inner)})
  if ($p.ExitCode -eq 0) { 'done' } else { 'failed' }
} catch { 'canceled' }`, 10 * 60 * 1000);
  return r.out.split(/\r?\n/).pop() || 'failed';
}

module.exports = { readCliList, detectClis, sync, trust, PACKAGE, CLASSIC_KEYS };
