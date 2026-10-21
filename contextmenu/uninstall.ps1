# Kabuk kaldırılırken (güncelleme değil) kurulum programı çalıştırır (build/installer.nsh, customUnInstall).
# Sağ tık menüsündeki "Kabuk ile aç"ı yalnızca bu kurulu Kabuk'a aitse kaldırır; geliştirme klasöründen
# çalışan bir Kabuk menüyü kendine almışsa ona dokunmaz.
# Kabuk'un klasörü KABUK_DIR ortam değişkeninden gelir.
$ErrorActionPreference = 'SilentlyContinue'
$dir = ([string]$env:KABUK_DIR).TrimEnd('\')
if (-not $dir) { return }

# Windows 11 menüsü (paket): Kabuk kurduğu paketin klasörünü window-state.json'a yazar (menuInstalled = "sürüm|imza|klasör")
$state = Join-Path $env:APPDATA 'Kabuk\window-state.json'
try { $s = [IO.File]::ReadAllText($state) | ConvertFrom-Json } catch { $s = $null }
if ($s -and $s.menuInstalled -and ([string]$s.menuInstalled).ToLower().EndsWith(('|' + $dir).ToLower())) {
  Get-AppxPackage -Name 'Kabuk.ContextMenu' | Remove-AppxPackage
}

# Eski menü (kayıt defteri): komutu bu klasördeki Kabuk.exe'yi açıyorsa kaldır
$exe = (Join-Path $dir 'Kabuk.exe').ToLower()
foreach ($k in 'HKCU:\Software\Classes\Directory\shell\Kabuk', 'HKCU:\Software\Classes\Directory\Background\shell\Kabuk', 'HKCU:\Software\Classes\Drive\shell\Kabuk') {
  if (-not (Test-Path -LiteralPath $k)) { continue }
  $ours = Get-ChildItem -LiteralPath $k -Recurse | Where-Object { ([string]$_.GetValue('')).ToLower().Contains($exe) }
  if ($ours) { Remove-Item -LiteralPath $k -Recurse -Force }
}
