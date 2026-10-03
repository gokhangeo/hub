# Güvenlik Politikası

Güvenlik açığını herkese açık Issue içinde dosya örneği, TURN sırrı veya kişisel veriyle paylaşmayın. Depo sahibine GitHub Security Advisory üzerinden özel bildirim gönderin.

Rapora etkilenen sürümü, tekrar üretme adımlarını, beklenen etkiyi ve mümkünse zararsız bir kanıtı ekleyin. Gerçek kullanıcı dosyalarını, kalıcı parolaları veya kurumsal ağ adreslerini eklemeyin.

## Tasarım kararları

- Uzak cihazdan gelen tüm metadata sınırlandırılır ve dosya adları DOM'a yalnızca `textContent` ile yazılır.
- Dosya seç → QR akışında güçlü daveti açan ilk alıcı yetkilendirilir; linke bilerek giren alıcıda bellek sınırı içindeki dosyalar otomatik alınır. Oturum bağlantısı yalnızca alıcıyla paylaşılmalıdır. Klasik elle bağlantıda cihaz/dosya onayı korunur. Davet bir kimlik doğrulama hesabı veya karşı cihazın fiziksel kimliğinin garantisi değildir.
- TURN paylaşılan sırrı yalnız sunucu tarafında tutulur; frontend kısa ömürlü kimlik bilgisi alır.
- Gönderici başarı durumunu yalnız alıcının boyut ve SHA-256 doğrulamasından sonra gösterir.
- Uzun ömürlü cihaz güveni veya kullanıcı hesabı bulunmaz; her sayfa açılışında yeni kod üretilir.
