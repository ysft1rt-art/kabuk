// Kabuk: Windows 11 sağ tık menüsü eklentisi ("Kabuk ile aç")
//
// Windows 11'in yeni (kısa) sağ tık menüsüne yalnızca IExplorerCommand arayüzünü uygulayan ve
// paket kimliği olan eklentiler girebilir. Bu DLL o eklenti; kimliği KabukMenu.msix (imzasız
// "sparse" paket, asıl dosyalar Kabuk klasöründe) verir. Kurulumu main.js yapar.
//
// Menü her açıldığında clis.txt'teki komutlar PATH'te aranır:
//   hiç yoksa   → tek satır "Kabuk ile aç" (terminal açar)
//   varsa       → "Kabuk ile aç" alt menüsü: Terminal, ayraç, bulunan araçlar (Claude Code, Codex...)
// Tıklanınca Kabuk şu şekilde başlatılır:
//   electron.exe "<kabuk>" [--kabuk-run=<komut>] "--kabuk-dir=<klasör>"
// Kabuk zaten açıksa yeni pencere açılmaz, açık pencerede yeni sekme açılır (main.js second-instance).
//
// Derleme: build.ps1

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <shobjidl_core.h>
#include <shlwapi.h>
#include <string>
#include <vector>
#include <new>
#include <algorithm>
#include <cwctype>

#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "user32.lib")

// {90F4AFCE-255F-4C2C-96E8-DF116179198A}  (AppxManifest.xml'deki Clsid ile aynı olmalı)
static const CLSID CLSID_KabukMenu = { 0x90f4afce, 0x255f, 0x4c2c, { 0x96, 0xe8, 0xdf, 0x11, 0x61, 0x79, 0x19, 0x8a } };

static HMODULE g_module = nullptr;
static long g_objects = 0;   // yaşayan nesne sayısı (DllCanUnloadNow için)
static long g_locks = 0;

// ---------------------------------------------------------------- yardımcılar

static std::wstring ModulePath() {
  std::wstring buf(32768, L'\0');
  DWORD n = GetModuleFileNameW(g_module, &buf[0], (DWORD)buf.size());
  buf.resize(n);
  return buf;
}

static std::wstring ParentDir(const std::wstring& p) {
  size_t i = p.find_last_of(L'\\');
  return i == std::wstring::npos ? p : p.substr(0, i);
}

// DLL: <kabuk>\contextmenu\KabukMenu.dll
static std::wstring MenuDir() { return ParentDir(ModulePath()); }
static std::wstring AppDir() { return ParentDir(MenuDir()); }

static bool FileExists(const std::wstring& p) {
  DWORD a = GetFileAttributesW(p.c_str());
  return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

static std::wstring Trim(const std::wstring& s) {
  size_t a = s.find_first_not_of(L" \t\r\n");
  if (a == std::wstring::npos) return L"";
  size_t b = s.find_last_not_of(L" \t\r\n");
  return s.substr(a, b - a + 1);
}

static bool Turkish() { return PRIMARYLANGID(GetUserDefaultUILanguage()) == LANG_TURKISH; }

static HRESULT Dup(const std::wstring& s, LPWSTR* out) { return SHStrDupW(s.c_str(), out); }

// Kayıt defterinden PATH (Explorer'ın kendi ortamı, araç kurulduktan sonra eski kalmış olabilir)
static std::wstring RegPath(HKEY root, const wchar_t* key) {
  HKEY h;
  if (RegOpenKeyExW(root, key, 0, KEY_READ, &h) != ERROR_SUCCESS) return L"";
  DWORD type = 0, size = 0;
  std::wstring out;
  if (RegQueryValueExW(h, L"Path", nullptr, &type, nullptr, &size) == ERROR_SUCCESS && size) {
    std::wstring raw(size / sizeof(wchar_t) + 1, L'\0');
    if (RegQueryValueExW(h, L"Path", nullptr, &type, (LPBYTE)&raw[0], &size) == ERROR_SUCCESS) {
      raw.resize(wcslen(raw.c_str()));
      if (type == REG_EXPAND_SZ) {
        DWORD n = ExpandEnvironmentStringsW(raw.c_str(), nullptr, 0);
        std::wstring exp(n, L'\0');
        ExpandEnvironmentStringsW(raw.c_str(), &exp[0], n);
        exp.resize(wcslen(exp.c_str()));
        out = exp;
      } else {
        out = raw;
      }
    }
  }
  RegCloseKey(h);
  return out;
}

static std::vector<std::wstring> PathDirs() {
  std::wstring all;
  DWORD n = GetEnvironmentVariableW(L"PATH", nullptr, 0);
  if (n) {
    std::wstring env(n, L'\0');
    GetEnvironmentVariableW(L"PATH", &env[0], n);
    env.resize(wcslen(env.c_str()));
    all = env;
  }
  all += L";" + RegPath(HKEY_CURRENT_USER, L"Environment");
  all += L";" + RegPath(HKEY_LOCAL_MACHINE, L"SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
  std::vector<std::wstring> dirs;
  size_t start = 0;
  while (start <= all.size()) {
    size_t end = all.find(L';', start);
    if (end == std::wstring::npos) end = all.size();
    std::wstring d = Trim(all.substr(start, end - start));
    if (d.size() > 1 && d.front() == L'"' && d.back() == L'"') d = d.substr(1, d.size() - 2);
    while (d.size() > 3 && (d.back() == L'\\' || d.back() == L'/')) d.pop_back();
    if (!d.empty()) {
      bool seen = false;
      for (auto& x : dirs) if (_wcsicmp(x.c_str(), d.c_str()) == 0) { seen = true; break; }
      if (!seen) dirs.push_back(d);
    }
    start = end + 1;
  }
  return dirs;
}

struct Cli { std::wstring cmd, name, file; };

// clis.txt (UTF-8): "komut | ad" satırları
static std::vector<Cli> ReadCliList() {
  std::vector<Cli> list;
  HANDLE f = CreateFileW((MenuDir() + L"\\clis.txt").c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return list;
  std::string bytes;
  char buf[4096];
  DWORD got;
  while (ReadFile(f, buf, sizeof buf, &got, nullptr) && got) bytes.append(buf, got);
  CloseHandle(f);
  if (bytes.size() >= 3 && (unsigned char)bytes[0] == 0xEF) bytes = bytes.substr(3);   // BOM
  int wn = MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), nullptr, 0);
  std::wstring text(wn, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), &text[0], wn);
  size_t start = 0;
  while (start < text.size()) {
    size_t end = text.find(L'\n', start);
    if (end == std::wstring::npos) end = text.size();
    std::wstring line = Trim(text.substr(start, end - start));
    start = end + 1;
    if (line.empty() || line[0] == L'#') continue;
    size_t bar = line.find(L'|');
    if (bar == std::wstring::npos) continue;
    Cli c{ Trim(line.substr(0, bar)), Trim(line.substr(bar + 1)), L"" };
    // Komut adı yalnızca harf/rakam/-/_/. olabilir (komut satırına güvenle yazılsın)
    bool ok = !c.cmd.empty() && !c.name.empty();
    for (wchar_t ch : c.cmd) if (!(iswalnum(ch) || ch == L'-' || ch == L'_' || ch == L'.')) ok = false;
    if (ok) list.push_back(c);
  }
  return list;
}

// Kurulu araçlar. Explorer bir menü açılışında bizi defalarca çağırır; sonucu 3 saniye saklarız
static std::vector<Cli> g_found;
static ULONGLONG g_foundAt = 0;
static SRWLOCK g_lock = SRWLOCK_INIT;

static std::vector<Cli> FoundClis() {
  AcquireSRWLockExclusive(&g_lock);
  ULONGLONG now = GetTickCount64();
  if (!g_foundAt || now - g_foundAt > 3000) {
    std::vector<Cli> found;
    auto dirs = PathDirs();
    static const wchar_t* exts[] = { L".exe", L".cmd", L".bat", L".ps1", L".com" };
    for (auto& c : ReadCliList()) {
      for (auto& d : dirs) {
        for (auto e : exts) {
          std::wstring p = d + L"\\" + c.cmd + e;
          if (FileExists(p)) { c.file = p; break; }
        }
        if (!c.file.empty()) break;
      }
      if (!c.file.empty()) found.push_back(c);
    }
    g_found = found;
    g_foundAt = now;
  }
  auto copy = g_found;
  ReleaseSRWLockExclusive(&g_lock);
  return copy;
}

// Seçili klasör (klasöre ya da klasörün boş yerine sağ tık). Dosya sistemi dışındaysa boş
static std::wstring SelectedFolder(IShellItemArray* items) {
  if (!items) return L"";
  DWORD count = 0;
  if (FAILED(items->GetCount(&count)) || count == 0) return L"";
  IShellItem* item = nullptr;
  if (FAILED(items->GetItemAt(0, &item))) return L"";
  std::wstring out;
  LPWSTR path = nullptr;
  if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &path))) {
    out = path;
    CoTaskMemFree(path);
  }
  item->Release();
  if (!out.empty() && !(GetFileAttributesW(out.c_str()) & FILE_ATTRIBUTE_DIRECTORY)) out.clear();
  return out;
}

static void LaunchKabuk(const std::wstring& dir, const std::wstring& run) {
  std::wstring app = AppDir();
  std::wstring exe = app + L"\\node_modules\\electron\\dist\\electron.exe";
  if (!FileExists(exe)) return;
  // "C:\" gibi ters bölüyle biten yollar tırnağı kaçırmasın diye ters bölü ikilenir
  std::wstring d = dir;
  if (!d.empty() && d.back() == L'\\') d += L'\\';
  std::wstring cmd = L"\"" + exe + L"\" \"" + app + L"\"";
  if (!run.empty()) cmd += L" --kabuk-run=" + run;
  cmd += L" \"--kabuk-dir=" + d + L"\"";
  std::vector<wchar_t> line(cmd.begin(), cmd.end());
  line.push_back(L'\0');
  STARTUPINFOW si{};
  si.cb = sizeof si;
  PROCESS_INFORMATION pi{};
  if (CreateProcessW(exe.c_str(), line.data(), nullptr, nullptr, FALSE, 0, nullptr, app.c_str(), &si, &pi)) {
    AllowSetForegroundWindow(pi.dwProcessId);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
}

// ---------------------------------------------------------------- menü komutları

enum class Kind { Root, Terminal, Separator, Cli };

class Command;

class CommandEnum : public IEnumExplorerCommand {
 public:
  explicit CommandEnum(std::vector<IExplorerCommand*> cmds) : cmds_(std::move(cmds)) { InterlockedIncrement(&g_objects); }
  ~CommandEnum() {
    for (auto c : cmds_) c->Release();
    InterlockedDecrement(&g_objects);
  }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IEnumExplorerCommand) {
      *ppv = static_cast<IEnumExplorerCommand*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&refs_); }
  IFACEMETHODIMP_(ULONG) Release() override {
    long r = InterlockedDecrement(&refs_);
    if (!r) delete this;
    return r;
  }

  IFACEMETHODIMP Next(ULONG celt, IExplorerCommand** out, ULONG* fetched) override {
    ULONG n = 0;
    while (n < celt && pos_ < cmds_.size()) {
      out[n] = cmds_[pos_++];
      out[n]->AddRef();
      n++;
    }
    if (fetched) *fetched = n;
    return n == celt ? S_OK : S_FALSE;
  }
  IFACEMETHODIMP Skip(ULONG celt) override {
    pos_ = std::min<size_t>(pos_ + celt, cmds_.size());
    return pos_ < cmds_.size() ? S_OK : S_FALSE;
  }
  IFACEMETHODIMP Reset() override { pos_ = 0; return S_OK; }
  IFACEMETHODIMP Clone(IEnumExplorerCommand** out) override { *out = nullptr; return E_NOTIMPL; }

 private:
  long refs_ = 1;
  size_t pos_ = 0;
  std::vector<IExplorerCommand*> cmds_;
};

class Command : public IExplorerCommand {
 public:
  Command(Kind kind, Cli cli = {}) : kind_(kind), cli_(std::move(cli)) { InterlockedIncrement(&g_objects); }
  ~Command() { InterlockedDecrement(&g_objects); }

  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IExplorerCommand) {
      *ppv = static_cast<IExplorerCommand*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&refs_); }
  IFACEMETHODIMP_(ULONG) Release() override {
    long r = InterlockedDecrement(&refs_);
    if (!r) delete this;
    return r;
  }

  IFACEMETHODIMP GetTitle(IShellItemArray*, LPWSTR* name) override {
    switch (kind_) {
      case Kind::Root: return Dup(Turkish() ? L"Kabuk ile aç" : L"Open in Kabuk", name);
      case Kind::Terminal: return Dup(L"Terminal", name);
      case Kind::Cli: return Dup(cli_.name, name);
      default: *name = nullptr; return E_NOTIMPL;
    }
  }

  IFACEMETHODIMP GetIcon(IShellItemArray*, LPWSTR* icon) override {
    if (kind_ == Kind::Root || kind_ == Kind::Terminal) return Dup(AppDir() + L"\\icon.ico", icon);
    // Araç bir .exe ise kendi simgesi
    if (kind_ == Kind::Cli && cli_.file.size() > 4 && _wcsicmp(cli_.file.c_str() + cli_.file.size() - 4, L".exe") == 0)
      return Dup(cli_.file + L",0", icon);
    *icon = nullptr;
    return E_NOTIMPL;
  }

  IFACEMETHODIMP GetToolTip(IShellItemArray*, LPWSTR* tip) override { *tip = nullptr; return E_NOTIMPL; }

  IFACEMETHODIMP GetCanonicalName(GUID* guid) override {
    *guid = kind_ == Kind::Root ? CLSID_KabukMenu : GUID_NULL;
    return S_OK;
  }

  IFACEMETHODIMP GetState(IShellItemArray* items, BOOL, EXPCMDSTATE* state) override {
    // Klasör olmayan yerlerde (Bu Bilgisayar, Geri Dönüşüm Kutusu...) görünmez
    if (kind_ == Kind::Root && items && SelectedFolder(items).empty()) { *state = ECS_HIDDEN; return S_OK; }
    *state = ECS_ENABLED;
    return S_OK;
  }

  IFACEMETHODIMP Invoke(IShellItemArray* items, IBindCtx*) override {
    std::wstring dir = SelectedFolder(items);
    if (dir.empty()) return S_OK;
    if (kind_ == Kind::Terminal || (kind_ == Kind::Root && FoundClis().empty())) LaunchKabuk(dir, L"");
    else if (kind_ == Kind::Cli) LaunchKabuk(dir, cli_.cmd);
    return S_OK;
  }

  IFACEMETHODIMP GetFlags(EXPCMDFLAGS* flags) override {
    if (kind_ == Kind::Root) *flags = FoundClis().empty() ? ECF_DEFAULT : ECF_HASSUBCOMMANDS;
    else if (kind_ == Kind::Separator) *flags = ECF_ISSEPARATOR;
    else *flags = ECF_DEFAULT;
    return S_OK;
  }

  IFACEMETHODIMP EnumSubCommands(IEnumExplorerCommand** out) override {
    *out = nullptr;
    if (kind_ != Kind::Root) return E_NOTIMPL;
    auto clis = FoundClis();
    if (clis.empty()) return E_NOTIMPL;
    std::vector<IExplorerCommand*> cmds;
    cmds.push_back(new (std::nothrow) Command(Kind::Terminal));
    cmds.push_back(new (std::nothrow) Command(Kind::Separator));
    for (auto& c : clis) cmds.push_back(new (std::nothrow) Command(Kind::Cli, c));
    for (auto c : cmds) if (!c) { for (auto x : cmds) if (x) x->Release(); return E_OUTOFMEMORY; }
    auto e = new (std::nothrow) CommandEnum(std::move(cmds));
    if (!e) return E_OUTOFMEMORY;
    *out = e;
    return S_OK;
  }

 private:
  long refs_ = 1;
  Kind kind_;
  Cli cli_;
};

// ---------------------------------------------------------------- COM fabrikası

class Factory : public IClassFactory {
 public:
  IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IClassFactory) {
      *ppv = static_cast<IClassFactory*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return 2; }
  IFACEMETHODIMP_(ULONG) Release() override { return 1; }
  IFACEMETHODIMP CreateInstance(IUnknown* outer, REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    *ppv = nullptr;
    if (outer) return CLASS_E_NOAGGREGATION;
    auto c = new (std::nothrow) Command(Kind::Root);
    if (!c) return E_OUTOFMEMORY;
    HRESULT hr = c->QueryInterface(riid, ppv);
    c->Release();
    return hr;
  }
  IFACEMETHODIMP LockServer(BOOL lock) override {
    if (lock) InterlockedIncrement(&g_locks); else InterlockedDecrement(&g_locks);
    return S_OK;
  }
};

static Factory g_factory;

STDAPI DllGetClassObject(REFCLSID clsid, REFIID riid, void** ppv) {
  if (!ppv) return E_POINTER;
  *ppv = nullptr;
  if (clsid != CLSID_KabukMenu) return CLASS_E_CLASSNOTAVAILABLE;
  return g_factory.QueryInterface(riid, ppv);
}

STDAPI DllCanUnloadNow() { return g_objects == 0 && g_locks == 0 ? S_OK : S_FALSE; }

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    g_module = module;
    DisableThreadLibraryCalls(module);
  }
  return TRUE;
}
