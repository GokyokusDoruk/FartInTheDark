# Fart in the Dark

Karanlıkta yer değiştir, popoyu çevir, ışıklar yanınca pırtla. Son kalan kazanır.

2–8 kişilik, absürt bir tahmin ve nişan oyunu. Telefon (iOS + Android) için tasarlandı; tarayıcıda da oynanır (`fartinthedark.dorukplays.com`).

- Tasarım: [docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md](docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md)
- Faz 1 planı (botlarla web oyunu): [docs/superpowers/plans/2026-11-23-phase1-offline-bots.md](docs/superpowers/plans/2026-11-23-phase1-offline-bots.md)
- Faz 2 planı (oda koduyla online): [docs/superpowers/plans/2026-11-23-phase2-online.md](docs/superpowers/plans/2026-11-23-phase2-online.md)

## Yapı

| Klasör | Ne |
|---|---|
| `packages/sim` | Oyun motoru: oda, hareket, gaz, puan, maç akışı, botlar. Saf TypeScript, deterministik, render'dan bağımsız. Faz 2'de sunucu da bunu kullanacak. |
| `packages/net` | Online'ın ortak dili ve odanın tüm kuralları (`RoomHost`): lobi, kurucu, botlar, evre süreleri, kişiye özel görünümler (karanlıkta rakip bilgisi gitmez), kopma/geri gelme. Botlar modu da bunu tarayıcıda çalıştırır. |
| `apps/server` | Cloudflare Worker + Durable Object: her oda kodu bir Durable Object; `RoomHost`'u WebSocket'e, alarma ve depolamaya bağlar. |
| `apps/client` | Vite + Three.js istemcisi: menü, online lobi, analoglar, karanlık + fener, yetenek ekranı, ağır çekim gaz. |

Balans sabitleri (hız, hasar eğrileri, süreler): `packages/sim/src/config.ts`.

## Çalıştırma

```powershell
npm install
```

```powershell
npm run dev
```

Sonra tarayıcıda http://127.0.0.1:5173 (aynı ağdaki telefondan da `http://<bilgisayar-ip>:5173`). Bu bilgisayarda `localhost` başka bir projeye gidiyor; `127.0.0.1` kullan.

```powershell
npm test
```

```powershell
npm run build
```

Derlenmiş site `apps/client/dist` klasörüne çıkar.

### Online'ı bilgisayarda denemek

İki ayrı terminalde:

```powershell
npm run dev:server
```

```powershell
npm run dev
```

Sonra iki tarayıcı sekmesinde http://127.0.0.1:5173 → **Online**: birinde **Oda Kur**, diğerinde kodla **Oda Koduyla Gir** (ya da "Paylaş" bağlantısını aç). Sunucu açıkken uçtan uca test:

```powershell
npm run smoke
```

Telefondan yerel sunucuya bağlanmak için istemciyi `VITE_SERVER_URL=http://<bilgisayar-ip>:8787` ile başlat ve sunucuyu `--ip 0.0.0.0` ile çalıştır.

## Yayın (Cloudflare Pages)

dorukplays.com'daki diğer oyunlar gibi bu oyun da kendi alt alan adında yayınlanır.

1. Cloudflare panelinde **Workers & Pages → Create → Pages → Connect to Git** ile bu repoyu (`GokyokusDoruk/FartInTheDark`) bağla.
2. Ayarlar:
   - Production branch: `main`
   - Build command: `npm install && npm run build`
   - Build output directory: `apps/client/dist`
   - Environment variable: `NODE_VERSION` = `22`
3. **Custom domains → Set up a custom domain**: `fartinthedark.dorukplays.com`.
4. dorukplays ana sayfasına kartı eklemek için `dorukplays` reposunun README'sindeki adımı izle (`href="https://fartinthedark.dorukplays.com"`).

`main`'e gelen her commit siteyi kendiliğinden günceller. (Kuruldu: proje `fartinthedark`, adres https://fartinthedark.dorukplays.com.)

## Online sunucu yayını (Cloudflare Workers)

Sunucu, dorukplays.com'un bulunduğu Cloudflare hesabında `fitd-server` adlı bir Worker'dır ve `fitd-server.dorukplays.com` adresinden çalışır. Ücretsiz planda çalışır (Durable Objects, SQLite).

**Otomatik yayın:** Worker, Cloudflare Workers Builds ile bu repoya bağlı. `main`'e gelen ve `apps/server/` ya da `packages/` altında değişiklik içeren her commit sunucuyu kendiliğinden yayınlar (derleme: `npm install`, yayın: `npm -w apps/server run deploy`). Yalnız istemciyi değiştiren commit'ler sunucuyu yeniden başlatmaz, böylece süren online maçlar kopmaz. Site (Pages) zaten her commit'te kendiliğinden güncellenir.

Elle yayınlamak gerekirse:

```powershell
npx -w apps/server wrangler login
```

```powershell
npm -w apps/server run deploy
```

İlk yayında `fitd-server.dorukplays.com` özel alan adı ve DNS kaydı kendiliğinden oluşur. İstemci yayında bu adresi kendisi kullanır; Pages'te ek ayar gerekmez.

Ücretsiz planın günlük kotaları var (istekler, Durable Object süresi). Arkadaş grubu ölçeğinde yetmesi beklenir; aşılırsa o günün geri kalanında yeni oda açılamaz ve gün sonunda (UTC 00:00) kendiliğinden düzelir.

## Kontroller

- Telefon: sol yarıda sürükle = yürü, sağ yarıda sürükle = popoyu (gazın gideceği yönü) çevir.
- Bilgisayar: WASD / oklar = yürü, fare = popoyu çevir.

## Online kuralları (özet)

- Odayı kuran kurucudur; bot ekler/çıkarır ve başlatır (toplam en fazla 8, en az 2).
- Maç sürerken odaya yeni oyuncu giremez. Bağlantısı kopan oyuncunun hamlelerini kolay bot oynar; aynı sekmeden geri dönünce (sayfa yenilense de) kaldığı yerden devam eder.
- Maçtan çıkan oyuncunun yerini kalıcı olarak bot alır. Kurucu çıkarsa yöneticilik bağlı ilk oyuncuya geçer.
- Tur sonu ekranı 10 sn sonra (ya da kurucu geçince) ilerler. Maç bitince kurucu aynı odayla tekrar başlatabilir.
- Odada 60 sn hiç bağlı oyuncu kalmazsa oda kapanır.
