# Kurumsal altyapı notları

Bu klasördeki dosyalar örnektir; alan adı, dış IP, TLS sertifikaları, güvenlik duvarı ve sır yönetimi kurum altyapısına göre ayarlanmalıdır.

- PeerJS Server yalnız sinyalleşme yapar ve WebSocket ters proxy gerektirir.
- coturn için süreli kimlik bilgileri `turn-credentials/server.mjs` tarafından üretilir.
- `TURN_SECRET` hem coturn hem kimlik servisine secret manager üzerinden aynı değerle verilmelidir.
- `ALLOWED_ORIGIN` kesin uygulama origin'i olmalıdır; `*` kullanmayın.
- TURN/TLS için 443 dış portunu coturn TLS portuna yönlendirin ve geçerli sertifika kullanın.
- coturn relay UDP aralığını güvenlik duvarında açın ve kapasiteye göre genişletin.

Örnekler doğrudan internete açılmadan önce kurumun ağ ve güvenlik ekibi tarafından gözden geçirilmelidir.
