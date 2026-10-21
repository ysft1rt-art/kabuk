# Kabuk

Electron + xterm.js + node-pty ile yapılmış Windows terminali. Kullanıcı kod yazmıyor; açıklamalar sade Türkçe.

## Git: her değişiklikten sonra commit

Proje Git ile takip ediliyor (uzak depo: https://github.com/ysft1rt-art/kabuk, dal `main`).
Her değişiklik bittikten ve test edildikten sonra commit at; mesaj sade Türkçe, ne değiştiğini anlatsın.
Bir işi yarım bırakıp commit atma, çalışmayan kodu commit'leme. `node_modules` commit'lenmez (`.gitignore`).
Push'u kullanıcı isterse yap.

## Kurulum dosyası ve otomatik güncelleme

Kabuk iki şekilde çalışır: **geliştirme klasöründen** (`electron.exe .`, masaüstü kısayolu; Claude burada çalışır)
ve **kurulum dosyasıyla kurulmuş** olarak (`Kabuk.exe`, `%LOCALAPPDATA%\Programs\kabuk`). Ayarlar klasörü ikisinde
aynı (`%APPDATA%\Kabuk`). Kodda ayrım `app.isPackaged`; main.js'te `ROOT`/`asset()` Kabuk.exe'nin yanındaki
dosyaları (simgeler `assets\`, `contextmenu\`) gösterir, çünkü uygulamanın kendisi `resources\app.asar` paketinin içinde.

- **Derleme:** `npm run dist` → `dist\Kabuk-Kurulum-<sürüm>.exe` (electron-builder, ayarlar package.json `build`).
  Tek tıkla kurulur, yönetici izni istemez. `build/installer.nsh`: güncellemeden önce kilitli olabilecek
  `KabukMenu.dll`'i kenara taşır (yoksa eski sürümün kaldırıcısı "File is busy" deyip güncellemeyi iptal ediyor;
  denendi), Kabuk kaldırılınca `contextmenu\uninstall.ps1` ile yalnızca bu kuruluma ait sağ tık menüsünü siler.
- **Yayınlama:** package.json'da `version`'ı artır, commit'le, `git tag v<sürüm>` + `git push origin main v<sürüm>`.
  GitHub Actions (`.github/workflows/release.yml`) kurulum dosyasını derleyip Releases'e koyar. (Yerelde
  `npm run release` de aynısını yapar ama `GH_TOKEN` ister.) Push/etiket yalnızca kullanıcı isteyince.
- **Güncelleme:** `updater.js` (electron-updater, kaynak GitHub Releases). Açılıştan 30 sn sonra ve 4 saatte bir
  bakar (`settings.autoUpdate`), bulursa arka planda indirir; üst çubukta `#updateBtn` çıkar (indirirken yüzde,
  hazır olunca "Güncelle"), açılır paneli `#updatePanel`. "Yeniden başlat ve güncelle" → `quitAndInstall` (sessiz
  kurulum, Kabuk kendiliğinden yeniden açılır). Basılmazsa Kabuk kapanırken kurulur. Ayarlar > Güncellemeler'de
  elle denetleme. Geliştirme klasöründe durum `unsupported`.
- **npm ile Electron güncellenince** `node_modules\electron\dist` boş kalabiliyor (indirme betiği çalışmıyor;
  2026-10-21'de oldu). Masaüstü kısayolu oradaki electron.exe'yi açtığı için kontrol et; yoksa
  `node node_modules/electron/install.js`.
- **Test:** geliştirme klasöründe `KABUK_UPDATE_CONFIG=<yml>` (generic sağlayıcı, yerel sunucu) ile güncelleme akışı
  denenebilir. Paketli uygulama `--user-data-dir=<geçici>` + `KABUK_HEADLESS=1` ile kullanıcının ayarlarına dokunmadan
  çalışır. Gerçek kurulum/güncelleme denemesi için ayrı ad (`KabukTest`) ve HEADLESS'ı sabit açık bir kopya derle:
  güncellemeden sonra kurulum programı Kabuk'u Gezgin üzerinden açtığı için ortam değişkenleri kaybolur ve gizli
  olmayan kopya kullanıcının sağ tık menüsünü değiştirir.

## Arayüz kuralı: Chromium'un hazır öğeleri yok

Uygulamanın hiçbir yerinde tarayıcının klasik/hazır öğeleri kullanılmaz:
`<select>`/`<option>`, `<input type="range|checkbox|radio|number|color|file">`, `alert/confirm/prompt`,
`title="..."` ipuçları, varsayılan kaydırma çubukları ve odak halkaları, `<dialog>`, `<datalist>`.

Yerine `renderer/ui.js` içindeki `KUI` bileşenleri kullanılır:

| Yerine          | Kullan                                             |
|-----------------|----------------------------------------------------|
| `<select>`      | `KUI.select(host, { options, value, onChange })`   |
| range           | `KUI.slider(host, { min, max, step, onInput })`    |
| checkbox        | `<button class="kswitch">` + `KUI.toggle(btn, fn)` |
| `confirm()`     | `await KUI.confirm({ title, message, ok, danger })`|
| `title=""`      | `data-tip=""`                                      |
| kaydırma çubuğu | `KUI.scrollbar(scroller, host)`                    |

Yeni bir kontrol gerekirse önce ui.js'e tema renkleriyle çizilen bir bileşen olarak eklenir.
Düz metin `<input>` serbest, ama `.set-input` stiliyle ve `spellcheck="false" autocomplete="off"` ile.
Değişiklik sonrası kontrol: `grep -n 'title=\|<select\|type="range"\|type="checkbox"\|confirm(' renderer/`

## Animasyonlar

`animate(el, sınıf, bitince)` (renderer.js) sınıfı ekler, animasyon bitince kaldırır; animasyonların kendisi styles.css'te.
Sekme açılışı (`tab-in`, ad yazıldıktan sonra ölçülen `--tab-w` genişliğine açılır), kapanışı (`tab-out`, bitince
DOM'dan silinir), yeni sekme içeriği (`content-in`), yeni bölünen panel (`pane-in-right/left/down/up`). Sekme adı
değişince genişlik `updateTabTitle` içinde yumuşakça kayar (açılış sürerken değil: `tab.opening`).
Terminal içeren öğelerde yalnızca kaydırma + saydamlık: `scale` xterm'in harf ölçüsünü bozar.
Panel genişliğini (flex) canlandırma: her karede kabuk yeniden boyutlanır.
Açılır paneller (`.popover`: kabuk menüsü, gizli terminaller, kısayollar) `showPopover`/`hidePopover` ile açılıp
kapanır (`pop-in`/`pop-out`); kapanış sürerken panel kapalı sayılır (`popoverOpen`). Doğrudan `hidden` sınıfı ekleme.

## Sekme sürükleme

`startTabDrag` (renderer.js): sekmeye basılı tutup 5 px'ten fazla çekince başlar. Sürüklerken DOM sırası değişmez,
yalnızca `transform` ile kayılır; bırakınca `tabs` dizisi ve DOM sırası birlikte değişir (Ctrl+Tab bu sırayı izler).

## Ctrl+Z: yeni terminali geri alma

`undoOpen` kısayolu (varsayılan Ctrl+Z, yalnızca terminal içinde). Bölünerek açılan panel `openedFrom` = bölünen panel,
yeni sekmenin paneli `openedFrom` = önceki sekme. O panele henüz tuş basılmadıysa/yapıştırılmadıysa (`touched`)
Ctrl+Z onu kapatıp geri döner; yoksa (`undoTarget()` null) tuş engellenmez ve programa gider (PowerShell'de geri alma).

## Sağ tık menüsü: "Kabuk ile aç" (`contextmenu/`)

Klasöre (veya klasörün boş yerine) sağ tık → "Kabuk ile aç". Hiç yapay zekâ aracı yoksa tek satır (terminal açar);
varsa alt menü: Terminal, ayraç, bulunan araçlar. Araç listesi `contextmenu/clis.txt` (`komut | ad`); hem eklenti
hem Kabuk bu dosyayı okur. Yeni araç = bir satır.

- **Kısa (Windows 11) menü:** `KabukMenu.dll` (C++, `IExplorerCommand`; araçları her menü açılışında PATH'te arar,
  3 sn önbellek) + kimlik paketi `KabukMenu.msix` (sparse, `-ExternalLocation` = Kabuk klasörü). Kurulu Kabuk için
  ayrı paket `KabukMenu-app.msix` (Executable = `Kabuk.exe`; ikisini de build.ps1 üretir, aynı sertifikayla imzalar).
  DLL `<klasör>\Kabuk.exe` varsa onu, yoksa `node_modules\electron\dist\electron.exe "<klasör>"`'ü başlatır. Kurulu bir
  Kabuk varsa (window-state.json `installedExe`) geliştirme klasöründen açılan Kabuk menüye dokunmaz. İmzasız paket
  per-user kurulamıyor ("unsigned package cannot include Executable activations"), bu yüzden paket `CN=Kabuk`
  imzalı: `build.ps1` her derlemede bellekte yeni sertifika üretir, imzalar, gizli anahtarı siler, açık kısmı
  `KabukMenu.cer`'e yazar. Windows'un güvenmesi için kullanıcı Ayarlar > Başlangıç'taki **"Windows 11 menüsüne
  ekle"** düğmesine basar (`menu.trust()`: UAC ile `LocalMachine\TrustedPeople`'a ekler). Bunu Claude yapmaz/test
  etmez: güvenlik ayarı, kullanıcının onayı.
- **Eski menü:** HKCU `Directory\shell`, `Directory\Background\shell`, `Drive\shell` altına kayıt defteri girdileri
  ("Diğer seçenekleri göster"). Yalnızca kısa menü yokken yazılır. Kısa menü kuruluyken silinir: Windows paketli
  eklentiyi "Diğer seçenekler"e de kendisi koyuyor, ikisi birden olunca orada iki "Kabuk ile aç" çıkıyor (denendi).
- `contextmenu/menu.js` kurulum/kaldırma/durum (Electron'suz, doğrudan test edilebilir); main.js açılışta ve ayar
  değişince `settings.contextMenu`'ye göre eşitler (HEADLESS'ta hiç dokunmaz).
- Tıklayınca: `electron.exe "<kabuk>" [--kabuk-run=<komut>] "--kabuk-dir=<klasör>"` (kurulu sürümde `Kabuk.exe [...]`). Kabuk tek kopya çalışır
  (`requestSingleInstanceLock`): açıksa yeni pencere değil yeni sekme (`second-instance` → `open:request`).
  `--kabuk-run` yalnızca clis.txt'teki komutlar için kabul edilir. Komut, komut istemi görününce yazılır (`runWhenReady`).
- DLL ya da manifest değişince: `powershell -File contextmenu\build.ps1` (Visual Studio C++ + Windows SDK gerekir),
  manifestte ve `menu.js` `PACKAGE_VERSION`'da sürümü artır. Explorer DLL'i yüklediyse dosya kilitli olur:
  derlemeden önce Görev Yöneticisi'nden Windows Gezgini'ni yeniden başlat. Yeni derleme yeni sertifika demek;
  kullanıcı düğmeye bir kez daha basmalı. Eklentiyi Explorer'sız denemek için küçük bir test programıyla
  `DllGetClassObject` → `EnumSubCommands` çağrılabilir.

## Temalar

`renderer/themes.js`. Her temanın koyu ve açık hali olmak zorunda (Koyu/Açık ayarı bütün temalarda geçerli).
Yeni bilinen tema eklemek için alttaki `add(key, ad, [koyu], [açık])` yeterli; sekme/çubuk/kenar renkleri
ve açık temada koyu tutulan "beyaz" otomatik türetilir. Temalar Ayarlar > Görünüm'deki açılır listeden seçilir.

## Çizim (WebGL)

Terminaller WebGL eklentisiyle çizilir. Eklenti `node_modules`'tan değil (`@xterm/addon-webgl` yalnızca kaynak olarak
devDependencies'te; kurulum dosyasına girmez), iki hata düzeltmesi yapılmış kopyası
`renderer/vendor/addon-webgl.js`'ten yüklenir (dosyanın başındaki açıklamada ne değiştiği yazıyor: buzlu camda soluk/
italik yazıların arkasındaki siyah kutular ve saydam zeminde incelen harfler). `@xterm/addon-webgl` güncellenirse
kopyayı aynı iki değişiklikle yeniden üret ve buzlu camı koyu + açık temada soluk (`\x1b[2m`) ve italik yazıyla dene.
Blok karakterleri (█ ▐ ▛ ▜, Claude Code maskotu) hücreyi boşluksuz
doldurur. Varsayılan DOM çizimi bunları yazı tipinden çizip aralarında boşluk bırakıyordu. Chromium en fazla 16
WebGL alanına izin verdiği için yalnızca seçili sekmenin panelleri WebGL kullanır (`syncRenderers`, en fazla 12);
diğer sekmeler ve gizli paneller normal çizimde bekler. `allowTransparency` yalnızca buzlu camda açık, çünkü
açıkken WebGL yazıları ince ve soluk çiziyor.

## Bildirimler ve bağlantılar

Programlar dikkat isteyince (`attend()` renderer.js): zil (BEL), OSC 9 (iTerm2/Codex; `9;4` ilerleme ve `9;9`
gibi ConEmu kodları sayılmaz), OSC 777;notify;başlık;mesaj (Ghostty biçimi). Seçili panele bakılıyorsa hiçbir şey
olmaz; aynı sekmede başka panelse çerçeve yanıp söner; değilse sekmede nokta + Windows bildirimi + görev çubuğu
(main.js `notify`). Claude Code tanımadığı terminale bildirim göndermez: kullanıcı Claude Code'da
`/config > Notifications > Ghostty` seçmeli. Windows bildirimi için main.js açılışta Başlat menüsüne
`Kabuk.lnk` (AppUserModelID `Kabuk`) yazar (yalnızca geliştirme klasöründe; kurulu sürümün kısayolunu kurulum programı yazar, aynı kimlikle: package.json `appId`). Testte gerçek bildirim çıkmasın: `Notification.prototype.show`'u değiştir.

Terminal bağlantıları: OSC 8 bağlantıları `linkHandler` → `confirmLink` (KUI onay kutusu, adres görünür) →
kullanıcının tarayıcısı. Pencere içinde başka sayfa açılamaz (`setWindowOpenHandler` deny, `will-navigate` engelli).

## Kısayollar

Bütün kısayollar `renderer/keys.js` içindeki `ACTIONS` listesinde (ad, grup, varsayılan tuşlar). Her işlemin
yaptığı iş `renderer.js`'teki `RUN` nesnesinde. Kullanıcının değiştirdikleri `settings.keys`'te saklanır;
Ayarlar > Kısayollar ve ? penceresi bu listeden otomatik oluşur. Yeni kısayol = `ACTIONS`'a bir satır + `RUN`'a bir fonksiyon.
Düğme ipuçlarında kısayol yazmak için `data-tip` yerine `data-key-action="işlem" data-tip-text="Metin"` kullan
(kısayol değişince ipucu kendiliğinden güncellenir). Sabit kalanlar: Ctrl+C (seçim yoksa durdur), sağ tık, Shift+Enter.

## Test

Uygulamayı kullanıcının ayarlarına dokunmadan test etmek için: `KABUK_HEADLESS=1` ayarlayıp
`app.setPath('userData', <geçici klasör>)` yapan ve `main.js`'i `require` eden bir betiği
`node_modules\electron\dist\electron.exe` ile çalıştır; arayüzü `webContents.executeJavaScript` ile sür,
`capturePage()` ile ekran görüntüsü al.

Tıklamaları **gerçek fare olaylarıyla** test et: `webContents.sendInputEvent({ type: 'mouseDown' / 'mouseUp' / 'mouseMove', x, y })`.
`element.click()` mousedown'ı atlar; bu yüzden "mousedown'da menüyü kapatan" türden hatalar ancak gerçek olaylarla yakalanır
(açılır listedeki temalara tıklanamama hatası böyle gözden kaçtı).

## Eğlence modu

Varsayılan açık (`settings.fun`). Diğer varsayılanlar: tema modu Otomatik, buzlu cam açık, yoğunluk %80
(`DEFAULTS` renderer.js; varsayılan değişince `v` artırılıp eski kayıttan o anahtarlar silinir). Açıkken boş komut satırına `kedi`, `köpek` vb. yazıp Enter'a basınca animasyon
oynar (`renderer/fun.js`). Karar Enter anında ekrana bakılarak verilir (`tryFun`): satır "komut istemi + kelime"
değilse Enter kabuğa normal gider. Alt satıra taşan uzun istemler birleştirilir (`lineBeforeCursor`). Kelimeler
büyük/küçük harf ve Türkçe harf farkı gözetmeden eşleşir (`funScene`).

## Komut önerileri

Yeni açılan panelde, henüz bir şey yazılmamışken boş komut satırında soluk örnek komutlar akar (`settings.tips`,
varsayılan açık; `fun.js` `TIPS` listesi kabuk türüne göre: powershell / cmd / bash, `shellKind` renderer.js).
Yazmaya başlayınca gizlenir; ilk gerçek komut kabuğa gidince o panelde bir daha çıkmaz (`everTyped`).
Eğlence kelimeleri, yazıp silmek ve boş Enter önerileri kapatmaz. Eğlence modu da açıksa eğlence ipucu önerilerin bir
alt satırında sabit durur ve ilk gerçek komuttan sonra o da gizlenir; eğlence kelimeleri yine çalışır (`updateHint`).

## Dil desteği (Türkçe / English)

`renderer/i18n.js`. Metinler kodda ve index.html'de **Türkçe** yazılır; İngilizcesi aynı dosyadaki `EN` sözlüğündedir
(anahtar = Türkçe metin). Kodda `t('Yeni sekme')`, değişkenli `t('{n} terminal açık', { n })`. Çevirisi olmayabilecek
yazılar (kabuk adları, programların koyduğu başlıklar) için `tq()`. index.html'deki sabit yazılar `translatePage()`
ile kendiliğinden çevrilir; içinde `<b>` olan paragraflara `data-i18n-html` eklenir. Kodun doldurduğu kutular
`I18N_SKIP` listesindedir. `data-tip` Türkçe yazılır, ipucu gösterilirken çevrilir (ui.js).
Ayar `settings.lang` (boşsa Windows'un dili); dil değişince `applyLanguage()` her şeyi yeniden çizer, ana sürece de
gider (main.js `mt()`: klasör seçme pencereleri ve uyarılar). Yeni yazı = Türkçesini `t()` ile yaz + `EN`'e İngilizcesini ekle.
Değişken adı olarak `t` kullanma: çeviri fonksiyonunu gölgeler.
Kontrol: İngilizce açıkken `i18nMissing()` çevirisi eksik metinleri listeler.
