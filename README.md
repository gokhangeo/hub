# Bulutsuz Transfer

Bulutsuz Transfer, iki tarayıcı arasında WebRTC veri kanalıyla şifreli dosya aktarımı yapan kurulabilir bir PWA'dır. Bağlantı doğrudan kurulamadığında kurumsal dağıtımda yapılandırılan TURN sunucusu şifreli paketleri röle eder.

## Öne çıkanlar

- 80 bitlik, `crypto.getRandomValues()` tabanlı tek kullanımlık cihaz kodu
- Gelen cihaz ve dosya için açık kullanıcı onayı
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

Android'de Chromium tabanlı destekleyen bir tarayıcıdan siteyi **Uygulamayı kur** ile kurun. Ardından Galeri veya Dosyalar uygulamasındaki **Paylaş** menüsünde Bulutsuz Transfer hedef olarak görünür. Seçilen dosyalar güvenli kuyruğa alınır; mevcut bir alıcı bağlantısı varsa dosya onay akışı başlar, yoksa kullanıcıdan alıcıya bağlanması istenir.

Web Share Target işletim sistemi tarafından PWA'yı görünür veya arka planda başlatır; tamamen çalışmayan/kurulmamış bir web sayfasının WebRTC bağlantısını sürdürmesi tarayıcı güvenlik modeli nedeniyle mümkün değildir. iOS, web uygulamalarını genel dosya paylaşım hedefi olarak aynı biçimde sunmadığından iPhone/iPad'de bağlantı veya QR ile siteyi açıp dosya seçme akışı kullanılır.

Mobil paylaşım hedefi, geçici cihaz depolamasını korumak için tek istekte en fazla 20 dosya ve toplam 512 MB kabul eder. Daha büyük dosyalar uygulama açıldıktan sonra normal dosya seçiciyle gönderilebilir.

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
  ackTimeoutMs: 120000
});
```

`iceServersUrl`, coturn'un paylaşılan sırrını tarayıcıya vermeden kısa ömürlü TURN kullanıcı adı ve parolası döndürmelidir. Örnek servis ve ters proxy ayarları [`infra/`](infra/) klasöründedir. Üretimde TURN sırrını Git'e veya frontend dosyalarına koymayın.

PeerJS sinyal sunucusu dosya içeriğini taşımaz. TURN yalnızca doğrudan bağlantı başarısız olduğunda şifreli WebRTC paketlerini röle eder. Kurumsal güvenlik duvarında TURN UDP, TURN TCP ve en kısıtlı ağlar için TURN/TLS 443 erişimi planlanmalıdır.

## Güvenlik modeli ve sınırlar

- WebRTC veri kanalı DTLS ile şifrelenir; uygulama ayrıca dosyanın SHA-256 özetini doğrular.
- Cihaz kodu bir oturum sırrıdır. Parmak izi iki cihazda sözlü olarak karşılaştırılmalıdır.
- Varsayılan bellek tabanlı indirme sınırı 200 MB'dir. Daha büyük dosyalar File System Access API destekleyen tarayıcıda doğrudan diske yazılır.
- Ağ veya veri kanalı kesilirse, iki sayfa da açık kaldığı sürece aynı cihaz yeniden bağlanıp aktarımı alınan son parçadan sürdürebilir. Tarayıcı tamamen kapatılırsa güvenlik ve dosya izinleri nedeniyle aktarım yeniden başlatılır.
- PWA paylaşım kuyruğu IndexedDB kullanır ve dosyalar kuyruğa alındıktan sonra ilk okumada silinir.

Güvenlik bildirimi için [`SECURITY.md`](SECURITY.md) dosyasına bakın.

## Kaynaklar

- [PeerJS Server resmi deposu](https://github.com/peers/peerjs-server)
- [coturn resmi yapılandırma örneği](https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf)

## Lisans

MIT
