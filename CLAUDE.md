# Kabuk

Electron + xterm.js + node-pty ile yapılmış Windows terminali. Kullanıcı kod yazmıyor; açıklamalar sade Türkçe.

## Git: her değişiklikten sonra commit

Proje Git ile takip ediliyor (uzak depo: https://github.com/ysft1rt-art/kabuk, dal `main`).
Her değişiklik bittikten ve test edildikten sonra commit at; mesaj sade Türkçe, ne değiştiğini anlatsın.
Bir işi yarım bırakıp commit atma, çalışmayan kodu commit'leme. `node_modules` commit'lenmez (`.gitignore`).
Push'u kullanıcı isterse yap.

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

## Temalar

`renderer/themes.js`. Her temanın koyu ve açık hali olmak zorunda (Koyu/Açık ayarı bütün temalarda geçerli).
Yeni bilinen tema eklemek için alttaki `add(key, ad, [koyu], [açık])` yeterli; sekme/çubuk/kenar renkleri
ve açık temada koyu tutulan "beyaz" otomatik türetilir. Temalar Ayarlar > Görünüm'deki açılır listeden seçilir.

## Çizim (WebGL)

Terminaller WebGL eklentisiyle çizilir. Eklenti `node_modules`'tan değil, iki hata düzeltmesi yapılmış kopyası
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
`Kabuk.lnk` (AppUserModelID `Kabuk`) yazar. Testte gerçek bildirim çıkmasın: `Notification.prototype.show`'u değiştir.

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

Varsayılan kapalı (`settings.fun`). Açıkken boş komut satırına `kedi`, `köpek` vb. yazıp Enter'a basınca animasyon
oynar (`renderer/fun.js`). Karar Enter anında ekrana bakılarak verilir (`tryFun`): satır "komut istemi + kelime"
değilse Enter kabuğa normal gider. Alt satıra taşan uzun istemler birleştirilir (`lineBeforeCursor`). Kelimeler
büyük/küçük harf ve Türkçe harf farkı gözetmeden eşleşir (`funScene`).

## Komut önerileri

Yeni açılan panelde, henüz bir şey yazılmamışken boş komut satırında soluk örnek komutlar akar (`settings.tips`,
varsayılan açık; `fun.js` `TIPS` listesi kabuk türüne göre: powershell / cmd / bash, `shellKind` renderer.js).
Yazmaya başlayınca gizlenir; ilk gerçek komut kabuğa gidince o panelde bir daha çıkmaz (`everTyped`).
Eğlence kelimeleri, yazıp silmek ve boş Enter önerileri kapatmaz. Eğlence modu da açıksa eğlence ipucu önerilerin bir
alt satırında sabit durur; öneriler bitince eskisi gibi komut satırının yanına geçer (`updateHint`).
