# Kabuk sağ tık menüsünü derler: KabukMenu.dll (C++) ve KabukMenu.msix (kimlik paketi).
# Gerekenler: Visual Studio (C++ masaüstü araçları) ve Windows SDK (makeappx).
# Çıktılar bu klasöre yazılır ve Git'e eklenir (kullanıcının derlemesi gerekmez).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ araçları bulunamadı' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'

$sdkBin = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Directory |
  Where-Object { $_.Name -match '^10\.' -and (Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')) } |
  Sort-Object { [version]$_.Name } | Select-Object -Last 1
if (-not $sdkBin) { throw 'Windows SDK (makeappx.exe) bulunamadı' }
$makeappx = Join-Path $sdkBin.FullName 'x64\makeappx.exe'

$obj = Join-Path $env:TEMP 'kabuk-menu-build'
New-Item -ItemType Directory -Force $obj | Out-Null

# DLL: statik C çalışma kitaplığı (/MT), Explorer'a ek DLL gerektirmesin
$cl = "cl /nologo /O2 /MT /EHsc /W4 /std:c++17 /utf-8 /DUNICODE /D_UNICODE /LD " +
      "`"$here\KabukMenu.cpp`" /Fo`"$obj\\`" /Fe`"$here\KabukMenu.dll`" " +
      "/link /DEF:`"$here\KabukMenu.def`" /IMPLIB:`"$obj\KabukMenu.lib`""
# vcvars "vswhere.exe bulunamadı" diye zararsız bir uyarı basıyor; onu sustur, derleyicinin çıktısı görünsün
$ErrorActionPreference = 'Continue'
cmd /c "`"$vcvars`" >nul 2>nul && $cl 2>&1"
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE) { throw "Derleme başarısız ($LASTEXITCODE)" }

# Paket: AppxManifest.xml + simge
$pkg = Join-Path $obj 'pkg'
Remove-Item -Recurse -Force $pkg -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkg | Out-Null
Copy-Item "$here\package\AppxManifest.xml" $pkg
Copy-Item "$here\..\icon.png" "$pkg\icon.png"   # simge, Kabuk klasöründeki icon.png ile aynı ad (Windows oradan okur)
& $makeappx pack /o /nv /d $pkg /p "$here\KabukMenu.msix" | Out-Null
if ($LASTEXITCODE) { throw "makeappx başarısız ($LASTEXITCODE)" }

# İmza: her derlemede yeni bir "CN=Kabuk" sertifikası bellekte üretilir, paket imzalanır, gizli anahtar
# silinir. Yalnızca açık sertifika (KabukMenu.cer) kalır; Windows'a güvendirilen budur. Anahtar olmadığı
# için bu sertifikayla başka hiçbir şey imzalanamaz. Yeniden derlenince kullanıcının Ayarlar'daki
# "Windows 11 menüsüne ekle" düğmesine bir kez daha basması gerekir (yeni sertifika).
$signtool = Join-Path $sdkBin.FullName 'x64\signtool.exe'
$X = 'System.Security.Cryptography.X509Certificates'
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$req = New-Object "$X.CertificateRequest" 'CN=Kabuk', $rsa, ([System.Security.Cryptography.HashAlgorithmName]::SHA256), ([System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$req.CertificateExtensions.Add((New-Object "$X.X509BasicConstraintsExtension" $false, $false, 0, $true))
$req.CertificateExtensions.Add((New-Object "$X.X509KeyUsageExtension" ([System.Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature), $true))
$eku = New-Object System.Security.Cryptography.OidCollection
$eku.Add((New-Object System.Security.Cryptography.Oid '1.3.6.1.5.5.7.3.3')) | Out-Null   # kod imzalama
$req.CertificateExtensions.Add((New-Object "$X.X509EnhancedKeyUsageExtension" $eku, $false))
$cert = $req.CreateSelfSigned([DateTimeOffset]::Now.AddDays(-1), [DateTimeOffset]::Now.AddYears(30))
$pfx = Join-Path $obj ([guid]::NewGuid().ToString() + '.pfx')
$pass = [guid]::NewGuid().ToString()
try {
  [IO.File]::WriteAllBytes($pfx, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $pass))
  [IO.File]::WriteAllBytes("$here\KabukMenu.cer", $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
  $ErrorActionPreference = 'Continue'
  & $signtool sign /q /fd SHA256 /f $pfx /p $pass "$here\KabukMenu.msix" 2>&1 | Out-Null
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($code) { throw "İmzalama başarısız ($code)" }
} finally {
  Remove-Item -Force $pfx -ErrorAction SilentlyContinue
  $cert.Dispose(); $rsa.Dispose()
}
Write-Output ("Tamam: KabukMenu.dll, KabukMenu.msix, KabukMenu.cer (" + (New-Object "$X.X509Certificate2" "$here\KabukMenu.cer").Thumbprint + ")")
