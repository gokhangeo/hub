# Bulutsuz Transfer

Bulutsuz Transfer, iki tarayıcı arasında WebRTC veri kanalıyla şifreli dosya aktarımı yapan kurulabilir bir PWA'dır. Bağlantı doğrudan kurulamadığında kurumsal dağıtımda yapılandırılan TURN sunucusu şifreli paketleri röle eder.

## Öne çıkanlar

- 80 bitlik, `crypto.getRandomValues()` tabanlı tek kullanımlık cihaz kodu
- Dosya seç → otomatik QR; güvenli davet ile ilk alıcıya otomatik aktarım
- Kodla klasik bağlantıda cihaz/dosya onayı
- Sıralı parça kontrolü, boyut sınırı, zaman aşımı, iptal ve yeniden deneme
- Gönderici ve alıcıda artımlı SHA-256 bütünlük doğrulaması
- Büyük dosyalarda desteklenen masaüstü tarayıcılarda doğrudan diske yazma
- Kurumsal PeerJS sinyal sunucusu, STUN/TURN ve süreli TURN kimliği desteği
- Android/Chromium Web Share Target ile sistem paylaşım menüsünden dosya alma
- Klavye, ekran okuyucu, azaltılmış hareket ve mobil arayüz desteği
- Sabit npm sürümleri, CSP, birim testleri ve GitHub Pages dağıtım iş akışı

## Geliştirme

Node.js 22.12 veya üzeri gerekir.

```bash
npm ci
npm run dev
```

Üretim kontrolü:

```bash
npm run check
```

Derlenen dosyalar `dist/` klasörüne yazılır.

## Mobil paylaşım hedefi

Android'de Chromium tabanlı destekleyen bir tarayıcıdan siteyi **Uygulamayı kur** ile kurun. Ardından Galeri veya Dosyalar uygulamasındaki **Paylaş** menüsünde Bulutsuz Transfer hedef olarak görünür. Seçilen dosyalar geçici kuyruğa alınır ve otomatik QR ekranı açılır. Alıcı kamerayla QR’ı açar; uygulama kurulumu gerekmez.

Web Share Target, Android’de kurulu PWA’yı açar. Paylaşılan dosyalar alındığında doğrudan QR gönderim ekranına geçilir. iPhone’da Safari/PWA, PDF uygulamasının Paylaş menüsünde genel dosya hedefi oluşturamaz; aşağıdaki dosya seçme akışı kullanılır. Her iki cihazda aktarım ekranı açık kalmalıdır.

Mobil paylaşım hedefi, geçici cihaz depolamasını korumak için tek istekte en fazla 20 dosya ve toplam 512 MB kabul eder. Daha büyük dosyalar uygulama açıldıktan sonra normal dosya seçiciyle gönderilebilir.

## iPhone Kullanımı

[HUB’ı Safari’de açın](https://gokhangeo.github.io/hub/). Kurulum isteğe bağlıdır; ilk kullanımda da dosya gönderebilirsiniz.

Ana ekrana eklemek için:

1. Safari’de HUB’ı açın.
2. **Paylaş ↑** düğmesine dokunun.
3. **Ana Ekrana Ekle** seçeneğini seçin.
4. **Ekle** düğmesine dokunun. Bulutsuz Transfer simgesi ana ekranınıza gelir.

Dosya gönderme:

1. Bulutsuz Transfer’i açın ve **Dosya Gönder** düğmesine dokunun.
2. Dosyalar seçicisinden PDF veya başka dosya seçin. iCloud Drive, iPhone’umda, İndirilenler ve etkin üçüncü taraf dosya sağlayıcıları iOS seçicisi tarafından sunulur. Dosya türü filtresi yoktur; birden fazla dosya seçebilirsiniz.
3. Dosya adı, boyutu ve QR otomatik görünür.
4. Diğer cihaz kendi kamerasıyla QR’ı okutup bağlantıyı açar. Kod tekrar sorulmaz.
5. Aktarım ve SHA-256 doğrulaması tamamlanır. Alıcı **Dosyayı İndir** düğmesini kullanır. Destekleniyorsa **Paylaş / Dosyalara Kaydet** ile iOS Dosyalar’a kaydeder.

Kamera yoksa **Bağlantıyı paylaş** ile oturum bağlantısını iMessage/WhatsApp gibi bir uygulamaya gönderin. Paylaşılan şey dosyanın kendisi değil oturum davetidir. Alternatif olarak alıcı **Dosya Al** ekranına mevcut güvenli BT kodunu girebilir. Windows/Mac’te dosya sürükleyip bırakmak da desteklenir.

### Safari/PWA sınırları

- Gönderici ve alıcı ekranlarını açık tutun. Arka plana alma, ekran kilidi veya ağ değişimi WebRTC’yi durdurabilir. Screen Wake Lock varsa bekleme/aktarım sırasında istenir; izin verilmezse uygulama çalışmaya devam eder. Kullanıcının elle ekranı kilitlemesini engellemez.
- Safari’nin indirmeyi engellememesi için iPhone’da açık bir **Dosyayı İndir** düğmesi tutulur. Masaüstünde otomatik indirme denenir. Safari’nin dosya kaydetme/paylaşma seçenekleri dosya türüne ve iOS sürümüne bağlıdır.
- Dosya gönderimi 64 KB parçalarla yapılır. Safari’de alım doğrudan kullanıcı diskine yazılamadığı için varsayılan toplam bellek sınırı **200 MB**’dir. 250 MB alım, `showSaveFilePicker` destekleyen masaüstü Chromium tarayıcısı gerektirir. Sınır artırılarak iPhone’da 250 MB başarı sözü verilmez.
- İki sayfa da açık kalırsa bağlantıyı yeniden kurup göndericide **Yeniden dene** ile aynı dosyaya devam edebilirsiniz. Alıcı alınan parça indeksinden devam eder; gönderici yine dosyanın tüm SHA-256 özetini hesaplar. Sayfa kapanırsa dosyayı yeniden seçmek gerekir.
- Varsayılan dağıtımda STUN ve genel PeerJS kullanılır; **aktif TURN hizmeti yapılandırılmamıştır**. Aynı Wi-Fi ilk test için uygundur. Mobil veri/kurumsal NAT gibi ağlar arasında bağlantı garantisi için mevcut TURN yapılandırması gerekir. Bu geliştirme yeni ücretli servis veya hesap şartı eklemez.

## Otomatik ve cihaz testleri

```bash
npm run check
npx playwright install --with-deps chromium webkit
npm run test:browser
```

Tarayıcı testleri yerel bir PeerJS sinyal servisi ve gerçek WebRTC kullanır; test sinyal servisi yalnız SDP/ICE bilgilerini yönlendirir. Dosya sunucuya gönderilmez. Ağ arayüzü oluşturamayan kapalı CI ortamları için isteğe bağlı `BULUTSUZ_TEST_TRANSPORT=1` taşıma taklidi vardır. Bu mod PeerJS serileştirme, uygulama protokolü, dosya/hash ve kullanıcı akışlarını sınar; **DTLS/ICE veya gerçek cihaz uyumluluğunu doğrulamaz**. Üretim paketine girmez.

Fiziksel cihaz matrisi ve testlerin gerçek durumu: [docs/TESTING.md](docs/TESTING.md).

## GitHub Pages güncellemesi

Mevcut `.github/workflows/pages.yml` korunur. Bu değişikliklerin bulunduğu branch/PR **main** ile birleştirildiğinde Actions, test ve derlemeyi çalıştırıp `dist/` klasörünü otomatik yayımlar. Pages URL’si mevcut dağıtımda `/hub/` altındadır; QR URL’si kod içinde alan adı sabitlenmeden sayfanın origin’i ve Vite base’inden üretilir. Eski `?join=` bağlantıları ve yeni `?receive=` bağlantıları birlikte desteklenir.

Yayın sonrası telefonda sayfayı kapatıp yeniden açın veya Safari’de yenileyin. Yeni service worker cache sürümü eskisini temizler. Apple hesabı veya alıcıya uygulama kurulumu gerekmez.

## Kurumsal dağıtım

Kurumsal ağlarda yalnızca STUN yeterli değildir. Aşağıdaki üç bileşeni HTTPS üzerinden dağıtın:

1. Statik `dist/` uygulaması
2. WebSocket destekli özel PeerJS sinyal sunucusu
3. UDP/TCP ve tercihen TCP/TLS 443 üzerinden erişilen coturn

`public/runtime-config.js` dağıtıma göre düzenlenir:

```js
window.BULUTSUZ_CONFIG = Object.freeze({
  peerOptions: {
    host: 'transfer.example.gov.tr',
    port: 443,
    path: '/peerjs',
    secure: true,
    key: 'peerjs'
  },
  iceServers: [{ urls: ['stun:turn.example.gov.tr:3478'] }],
  iceServersUrl: '/api/ice',
  maxFileBytes: 10 * 1024 * 1024 * 1024,
  maxMemoryFileBytes: 200 * 1024 * 1024,
  maxChunks: 200000,
  maxConcurrentInbound: 3,
  acceptTimeoutMs: 120000,
  ackTimeoutMs: 120000,
  sessionTimeoutMs: 10 * 60 * 1000
});
```

`iceServersUrl`, coturn'un paylaşılan sırrını tarayıcıya vermeden kısa ömürlü TURN kullanıcı adı ve parolası döndürmelidir. Örnek servis ve ters proxy ayarları [`infra/`](infra/) klasöründedir. Üretimde TURN sırrını Git'e veya frontend dosyalarına koymayın.

PeerJS sinyal sunucusu dosya içeriğini taşımaz. TURN yalnızca doğrudan bağlantı başarısız olduğunda şifreli WebRTC paketlerini röle eder. Kurumsal güvenlik duvarında TURN UDP, TURN TCP ve en kısıtlı ağlar için TURN/TLS 443 erişimi planlanmalıdır.

## Güvenlik modeli ve sınırlar

- WebRTC veri kanalı DTLS ile şifrelenir; uygulama ayrıca dosyanın SHA-256 özetini doğrular.
- QR/link/kod 80 bitlik bir oturum sırrıdır. Dosya seçimi, bu daveti açan **ilk alıcının** dosyaları almasına izin verir; QR/link yalnızca alıcıyla paylaşılmalıdır. Elle kodla klasik bağlantı kurulurken cihaz onayı korunur.
- 6 haneli tahmin edilebilir token veya merkezi kısa kod çözümleyicisi eklenmedi. Mevcut güvenli `BT-XXXX-XXXX-XXXX-XXXX` kodu kullanılır. Genel PeerJS üzerinde istemciye konulan hız sınırı sunucu tarafı brute-force koruması sağlayamaz; güvenlik güçlü token, tek alıcı ve oturum süresine dayanır.
- Varsayılan bellek tabanlı indirme sınırı 200 MB'dir. Daha büyük dosyalar File System Access API destekleyen tarayıcıda doğrudan diske yazılır.
- Ağ veya veri kanalı kesilirse, iki sayfa da açık kaldığı sürece aynı cihaz yeniden bağlanıp aktarımı alınan son parçadan sürdürebilir. Tarayıcı tamamen kapatılırsa güvenlik ve dosya izinleri nedeniyle aktarım yeniden başlatılır.
- PWA paylaşım kuyruğu IndexedDB kullanır; dosyalar okunup işlem başarıyla tamamlandığında kuyruk silinir. Gönderici File referanslarını başarı/oturum iptalinde bırakır. Alıcı indirme Blob’u, dosya indirilebilsin diye **Tamamlananları temizle** veya sayfanın kapanmasına kadar tutulur; toplam bellek sınırı uygulanır.
- Kullanılmayan oturumlar varsayılan 10 dakikada kapanır. Başarılı toplu gönderim veya oturum iptali sonunda PeerJS kimliği kapatılır. Yarım alımların devam süresi de sınırlıdır.

Güvenlik bildirimi için [`SECURITY.md`](SECURITY.md) dosyasına bakın.

## Kaynaklar

- [PeerJS Server resmi deposu](https://github.com/peers/peerjs-server)
- [coturn resmi yapılandırma örneği](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf)

## Lisans

MIT
