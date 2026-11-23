# Fart in the Dark

Karanlıkta yer değiştir, popoyu çevir, ışıklar yanınca pırtla. Son kalan kazanır.

2–8 kişilik, absürt bir tahmin ve nişan oyunu. Telefon (iOS + Android) için tasarlandı; tarayıcıda da oynanır (`fartinthedark.dorukplays.com`).

- Tasarım: [docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md](docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md)
- Faz 1 planı (botlarla web oyunu): [docs/superpowers/plans/2026-11-23-phase1-offline-bots.md](docs/superpowers/plans/2026-11-23-phase1-offline-bots.md)

## Yapı

| Klasör | Ne |
|---|---|
| `packages/sim` | Oyun motoru: oda, hareket, gaz, puan, maç akışı, botlar. Saf TypeScript, deterministik, render'dan bağımsız. Faz 2'de sunucu da bunu kullanacak. |
| `apps/client` | Vite + Three.js istemcisi: menü, analoglar, karanlık + fener, yetenek ekranı, ağır çekim gaz. |

Balans sabitleri (hız, hasar eğrileri, süreler): `packages/sim/src/config.ts`.

## Çalıştırma

```powershell
npm install
```

```powershell
npm run dev
```

Sonra tarayıcıda http://localhost:5173 (aynı ağdaki telefondan da `http://<bilgisayar-ip>:5173`).

```powershell
npm test
```

```powershell
npm run build
```

Derlenmiş site `apps/client/dist` klasörüne çıkar.

## Yayın (Cloudflare Pages)

dorukplays.com'daki diğer oyunlar gibi bu oyun da kendi alt alan adında yayınlanır.

1. Cloudflare panelinde **Workers & Pages → Create → Pages → Connect to Git** ile bu repoyu (`GokyokusDoruk/FartInTheDark`) bağla.
2. Ayarlar:
   - Production branch: `main`
   - Build command: `npm install && npm run build`
   - Build output directory: `apps/client/dist`
   - Environment variable: `NODE_VERSION` = `20`
3. **Custom domains → Set up a custom domain**: `fartinthedark.dorukplays.com`.
4. dorukplays ana sayfasına kartı eklemek için `dorukplays` reposunun README'sindeki adımı izle (`href="https://fartinthedark.dorukplays.com"`).

`main`'e gelen her commit siteyi kendiliğinden günceller.

## Kontroller

- Telefon: sol yarıda sürükle = yürü, sağ yarıda sürükle = popoyu (gazın gideceği yönü) çevir.
- Bilgisayar: WASD / oklar = yürü, fare = popoyu çevir.
