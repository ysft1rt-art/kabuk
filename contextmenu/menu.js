'use strict';

// Windows sağ tık menüsü ("Kabuk ile aç"): kurulu araçları bulma, menüyü kurma/kaldırma.
// main.js kullanır; Electron'a bağlı değil (test betikleri doğrudan çağırabilir).
//
// İki yol var:
//  1) Windows 11'in kısa menüsü: KabukMenu.dll (IExplorerCommand) + kimlik paketi KabukMenu.msix.
//     Paket "CN=Kabuk" ile imzalı; Windows'un bu imzaya güvenmesi için KabukMenu.cer bir kez
//     LocalMachine\TrustedPeople'a eklenmeli. Bunu kullanıcı Ayarlar'daki düğmeyle yapar (yönetici onayı, trust()).
//     Güven varsa paket bu kullanıcı için yönetici gerekmeden kurulur.
//  2) Eski menü ("Diğer seçenekleri göster"): HKCU kayıt defteri girdileri. Her zaman yazılır (kısa menü
//     kuruluyken de orada dursun). Bulunan araçlar her eşitlemede yeniden yazılır.
// Hepsi yalnızca bu kullanıcı için; menü kapatılınca paket ve girdiler silinir (sertifika güveni kalır,
// gizli anahtarı olmadığı için zararsız).

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const DIR = __dirname;
const PACKAGE = 'Kabuk.ContextMenu';
const PACKAGE_VERSION = '1.0.0.0';   // package/AppxManifest.xml ile aynı
const MSIX = path.join(DIR, 'KabukMenu.msix');
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
function detectClis(envPath = process.env.PATH || '') {
  const dirs = [...new Set(envPath.split(';').map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean))];
  const found = [];
  for (const c of readCliList()) {
    for (const d of dirs) {
      const file = ['.exe', '.cmd', '.bat', '.ps1', '.com'].map((e) => path.join(d, c.cmd + e)).find((f) => {
        try { return fs.statSync(f).isFile(); } catch { return false; }
      });
      if (file) { found.push({ ...c, file }); break; }
    }
  }
  return found;
}

// ---------- PowerShell ----------
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const encode = (script) => Buffer.from(`$ProgressPreference='SilentlyContinue'\n${script}`, 'utf16le').toString('base64');

function powershell(script, timeout = 90000) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)],
      { windowsHide: true, timeout },
      (err, stdout, stderr) => resolve({ ok: !err, out: String(stdout || '').trim(), err: String(stderr || (err && err.message) || '').trim() }));
  });
}

// ---------- Eski menü ----------
function menuCommand(ctx, run) {
  return `"${ctx.exe}" "${ctx.appDir}"${run ? ` --kabuk-run=${run}` : ''} "--kabuk-dir=%V"`;
}

function classicScript(ctx, install, clis = []) {
  const lines = [`foreach ($k in @(${CLASSIC_KEYS.map(psq).join(',')})) { if (Test-Path -LiteralPath $k) { Remove-Item -LiteralPath $k -Recurse -Force } }`];
  if (!install) return lines.join('\n');
  const icon = path.join(ctx.appDir, 'icon.ico');
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
    // Alt menü: en üstte Terminal (ardından ayraç), sonra bulunan araçlar
    lines.push(prop(k, 'SubCommands', "''"));
    const items = [
      { name: 'Terminal', run: null, icon, sepAfter: true },
      ...clis.map((c) => ({ name: c.name, run: c.cmd, icon: /\.exe$/i.test(c.file) ? c.file : '' })),
    ];
    items.forEach((it, i) => {
      const sub = `${k}\\shell\\${String(i + 1).padStart(2, '0')}`;
      lines.push(`New-Item -Path ${psq(sub)} -Force | Out-Null`);
      lines.push(prop(sub, 'MUIVerb', psq(it.name)));
      if (it.icon) lines.push(prop(sub, 'Icon', psq(it.icon)));
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
      await powershell(classicScript(ctx, true, clis));   // "Diğer seçenekleri göster" altında da dursun
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
