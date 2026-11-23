# Fart in the Dark — Tasarım Belgesi

*Tarih: 2026-11-23 · Oyun adı: **Fart in the Dark** (kullanıcının seçimi; mağazalarda aynı adlı oyun bulunamadı)*

## 1. Ne ve neden

Telefon (iOS + Android) için tasarlanmış, ayrıca **dorukplays.com**'da tarayıcıdan oynanabilen, 2–8 kişilik, absürt mizahlı bir **tahmin ve nişan** oyunu. Karakterler silah yerine popolarından gaz çıkararak birbirini zehirler.

Çekirdek fikir: herkes 5 saniye boyunca **karanlıkta, rakipleri görmeden** yer değiştirir ve nişan alır; süre bitince ışıklar yanar, herkes aynı anda "pırtlar", gazlar ağır çekimde ilerler. Oyun "rakip nereye kaçar, nereye nişan alır?" tahminine dayanır.

İlham: oyuncuların nişan lazerleriyle aynı anda ateş ettiği bir mobil oyun videosu. O oyun **kopyalanmayacak**; tür ve his aynı, isim / görsel / mekanik özgün.

### Başarı
- Arkadaşlar oda koduyla hızlıca bir araya gelip güle güle oynayabiliyor.
- Tek başına botlara karşı da oynanabiliyor.
- Telefonda akıcı, sitede anında açılıyor.

### Hedef dışı (şimdilik)
- Para kazanma (reklam, satın alma, kostüm) — yok.
- Hesap / giriş sistemi, kalıcı ilerleme, sıralama tablosu — yok.
- Rastgele eşleşme (matchmaking) — yok; sadece oda kodu.

### Anti-hedefler (çalışsa bile başarısızlık sayılır)
- Videodaki oyunun görünüşünün / adının kopyası olması.
- Karanlık evrede rakip konumlarının istemciye sızması (hile mümkün olur).
- Ciddi/karanlık bir ton — oyun **absürt ve komik** olmalı.

## 2. Görünüm ve his

- Oyun mantığı **2 boyutlu** (düz zemin, yukarıdan bakış); karakterler ve oda **3 boyutlu** görünür, kamera yukarıdan çapraz bakar. Dikey ekran.
- Karakterler yumuşak hatlı, absürt çöp adamlar (kapsül/kürelerden prosedürel — Claude'un kararı; ileride gerçek modelle değiştirilebilir).
- Pırtlarken karakter **domalır**; gaz popodan çıkar, yani karakterin yüzünün baktığı yönün **tersine** gider. Sağ analog popo doğrultusunu (= gazın gideceği yönü) belirler. Ekranda sağ analog çevrilince gazın gideceği yön kısa bir okla gösterilir. **Fener gazın gideceği yöne bakar** (Claude'un önerisi; kullanıcı yanıtlamadan "task task yap" dedi, değiştirilebilir) — böylece oyuncu atışının çarpacağı duvarları/boruları görüp sektirmeli atış planlayabilir.
- Gazı bitince karakter ayağa kalkar ve **sırıtarak** bekler.
- Zehirlendikçe **yüz rengi** değişir: normal ten → yeşil → mor (can azaldıkça). Ölünce absürt şekilde devrilir.
- Her karakterin başının üstünde **can barı** ve kalan can sayısı; bar can azaldıkça yeşilden kırmızıya döner.

## 3. Oyun yapısı

**Maç** → 5 **tur** → her tur birden çok **hamle**.

### 3.1 Maç
- 5 tur oynanır. Her tur sonunda ölüm sırasına göre puan verilir; 5 tur sonunda toplam puanı en yüksek olan kazanır.
- Puan: N oyunculu maçta ilk ölen 1, son kalan N puan alır. **Aynı anda** ölenler aynı sırayı paylaşır (ör. 4 kişide 1-2-2-4). "Aynı an" = aynı simülasyon adımı (tick).
- Maç sonu eşitliği: builder'a bırakıldı (öneri: son turda daha iyi sıralanan kazanır).

### 3.2 Tur
- Her tur **yeni bir oda** (yeni yerleşim, yeni eşyalar) ile başlar.
- Herkes **100 can** ile başlar; yetenek seviyeleri sıfırdır.
- Oyuncular odanın birbirinden uzak, rastgele noktalarında doğar.
- Tur, **tek kişi kalınca** (ya da herkes aynı anda ölünce) biter.
- Ölen oyuncu turun kalanını izleyici olarak seyreder.

### 3.3 Hamle (döngü)
1. **Yetenek evresi (15 sn):** Oyuncuya **5 yetenek puanı** verilir; hepsini 6 özelliğe dağıtmak zorundadır. Seviyeler tur içinde **birikir**, yeni turda sıfırlanır. Her özellik en fazla **10**. Süre biterse kalan puanlar rastgele dağıtılır. Tüm özellikleri 10 olan oyuncuya ekran açılmaz. Herkes bitirince erken geçilir.
2. **Karanlık evre (5 sn):**
   - Oda, oyuncuların **altında** rastgele bir açıyla döner ve biraz **daralır** (az miktarda; her hamle).
   - Döndükten sonra duvar/eşya içinde kalan oyuncu en yakın boş noktaya itilir. Daralan alanın dışında kalan oyuncu en yakın geçerli noktaya taşınır.
   - Oda zifiri karanlıktır. Görünen tek şey: odanın dış duvarları + oyuncunun nişan yönünde ~1 metrelik **fener** koni/ışığı. Fener **sadece haritayı** gösterir; rakipler fenerde görünmez.
   - Diğer oyuncuları görmek mümkün değildir (hayalet, iz vb. yok).
   - **Sol analog:** normal yürüme (hız sınırlı; 5 sn'de ne kadar gidilirse). **Sağ analog:** pırtlama yönü (360°).
3. **Açılış ve atış:** Süre bitince ışıklar yanar, herkes görünür, herkes domalır ve **aynı anda otomatik** pırtlar.
4. **Ağır çekim çözülme:** Gaz bulutları ağır çekimde ilerler; **tüm bulutlar dağılana kadar** sürer. Hasarlar can barlarında iyice görülür. Acele yok.
5. Hayatta kalanlarla bir sonraki hamleye geçilir. Oyuncular **son durdukları yerden** başlar.

Not: Çözülme sırasında oyuncular hareket etmez (sabit hedeflerdir).

## 4. Gaz

### 4.1 Özellikler (her biri 0–10 seviye)

| Özellik | Etkisi |
|---|---|
| Kalınlık | Bulutun genişliği / isabet alanı |
| Saçılma | Bulut ilerlerken yanlara partikül saçar; partiküller de hasar verir (ana buluttan az) |
| Menzil | Bulutun ne kadar yol aldığı |
| Hasar | Bulutun içinde kalan rakibe **saniye başına** verdiği hasar |
| Güç | Rakip gazla çarpışmada devam edebilme |
| Süre | Bulutun ne kadar yaşadığı; süre bitince dağılır, artık hasar vermez |

Seviye 0'da da kullanılabilir bir gaz olmalı (taban değerler). Seviye başına artış miktarları ve taban değerler **builder'a bırakıldı** (denge ayarı; sabitler tek bir yapılandırma dosyasında olmalı ki sonradan oynanabilsin). Hedef: 100 can ortalama 2–4 isabette bitsin.

### 4.2 Davranış
- Gaz **2 boyutlu düzlemde** düz bir doğrultuda ilerler (parabol/yükseklik yok).
- Rakibe çarptığında **durmaz**, yoluna devam eder; birden çok kişiyi zehirleyebilir.
- Oyuncu **kendi gazından** zehirlenmez (sekme/boru ile geri dönse bile).
- **Duvara çarparsa** fiziksel olarak doğru açıyla seker.
- **Gaz–gaz çarpışması:** gücü yüksek olan devam eder, düşük olan orada biter. Zayıf gazın gücü, güçlü gazın **hasarını** oranlı olarak azaltır. (Formül builder'a; öneri: `yeniHasar = hasar × (1 − zayıfGüç / güçlüGüç × k)`.) Güçler eşitse ikisi de biter.
- Bir oyuncu aynı anda birden çok buluttan hasar alabilir; ölüm sırası tick bazında belirlenir.

## 5. Harita / oda

- Dikdörtgen (ya da basit çokgen) bir oda; dış duvarlar + iç eşyalar.
- Eşya türleri:
  - **Duvar / engel:** gaz geçemez, seker. Oyuncu da geçemez.
  - **U borusu (metal boru):** bir ağızdan giren gazı başka bir ağızdan, başka yöne çıkarır.
  - **Büyütücü bölge:** içinden geçen gazı büyütür (kalınlık/hasar artar).
  - **Küçültücü bölge:** gazı küçültür.
  - **Yön değiştirici:** gazın yönünü belirli bir açıyla çevirir.
- Her tur için oda **rastgele üretilir** ya da hazır şablonlardan seçilip eşyalar rastgele dağıtılır (builder'ın kararı; adil ve oynanabilir olmalı — doğuş noktaları engelle kapanmamalı).
- Her hamlede oda oyuncuların altında rastgele açıyla döner ve az miktarda daralır.

## 6. Modlar ve çok oyunculu

### 6.1 Botlarla (tek kişilik)
- Oyuncu bot sayısını (1–7) ve zorluğu (kolay / orta / zor) seçer.
- Tüm simülasyon cihazda çalışır; internet gerekmez.
- Zor bot rakiplerin olası kaçışını tahmin ederek nişan alır.

### 6.2 Online (oda kodu)
- "Online" seçen oyuncu doğrudan **8 kişilik** bir oda kurar; odada sadece kendisi ve ekranda bir **oda kodu** vardır.
- Diğerleri "Oda koduyla gir" butonuyla katılır.
- Odayı kuran istediği kadar bot ekleyebilir (toplam ≤ 8) ve oyunu başlatır. En az 2 katılımcı (bot dahil).
- Hesap yok; takma adla oynanır.
- Kurucu çıkarsa yöneticilik başka bir oyuncuya geçer. Maç ortasında çıkan oyuncunun yerine bot geçer.
- **Sunucu otoriterdir:** karanlık evrede rakip konumları/nişanları istemciye **gönderilmez**. İstemci karanlık evre sonunda kendi konumunu ve nişanını gönderir; sunucu hareketi doğrular (hız sınırı), simülasyonu çalıştırır, sonucu herkese yollar.
- Simülasyon **deterministik** ve istemci ile sunucu arasında **paylaşılan kod** olmalı; botlar modu ve sunucu aynı motoru kullanır.

## 7. Teknik yaklaşım

### Değerlendirilen yaklaşımlar
| Yaklaşım | Artı | Eksi | Karar |
|---|---|---|---|
| **A) Web (TypeScript + Three.js) + Capacitor + Node/Colyseus** | Site anında açılır, tek kod tabanı, hızlı geliştirme/test | Mağaza uygulaması "native" hissi biraz daha zayıf | **Seçildi** |
| B) Unity (mobil + WebGL) | 3D ve mobil çok sağlam; Unity zaten kurulu | Web sürümü ağır (15–30 MB), telefon tarayıcısında takılabilir; geliştirme döngüsü yavaş | Elendi |
| C) Godot | Ücretsiz, hafif | Web sürümü iOS Safari'de sorunlu | Elendi |

Seçen: kullanıcı (A).

### Kararlar
- **İstemci:** TypeScript, Three.js (3D render), Vite (derleme). Dikey ekran, dokunmatik çift sanal analog; masaüstü tarayıcıda klavye/fare desteği (WASD + fare) — Claude'un kararı.
- **Paylaşılan simülasyon:** saf TypeScript, render'dan bağımsız, sabit adımlı (tick), deterministik.
- **Sunucu:** Node.js + Colyseus (oda, oda kodu, katılım, yeniden bağlanma).
- **Mobil:** Capacitor ile iOS ve Android paketleri.
- **Mac yok:** iOS derlemesi bulut macOS üzerinde yapılacak (GitHub Actions macOS runner veya Codemagic). Apple Developer hesabı (99$/yıl) ve Google Play hesabı (25$) kullanıcıya ait; mağaza yayını bu projenin ilk sürüm kapsamı dışında, ama yapı buna hazır olmalı. **İlk sürümde (Claude'un kararı):** Android için telefona doğrudan kurulabilen APK; iOS için bulut macOS'ta imzasız derleme kontrolü. TestFlight/imzalı iOS, kullanıcının Apple hesabı açıldığında ayrı iş olarak yapılır. Telefonda asıl test, sitenin telefon tarayıcısında ve Android APK'da yapılır.
- **Web yayını:** dorukplays.com Cloudflare Pages'te barındırılıyor ve oyunlar kendi alt alan adlarında yayınlanıyor (`oyunadi.dorukplays.com`). Bu oyun **`fartinthedark.dorukplays.com`** adresinde, bu repoya bağlı ayrı bir Cloudflare Pages projesi olarak yayınlanır. Ana sayfadaki kart, dorukplays reposunun README'sindeki yöntemle eklenir.
- **Sunucu barındırma:** küçük bir Node sunucusu (Fly.io / Railway / Render vb., ~5$/ay; sağlayıcı builder'a bırakıldı), Cloudflare DNS'te bir alt alan adıyla (öneri `fitd-server.dorukplays.com`), WSS üzerinden. Hesap açma / DNS kaydı kullanıcı tarafından yapılır.
- **Dil:** Arayüz Türkçe (İngilizce sonradan eklenebilecek şekilde metinler tek yerde) — Claude'un kararı.

## 8. Builder'a bırakılanlar
- Gaz özelliklerinin taban değerleri ve seviye başına artışlar (denge).
- Gaz–gaz hasar azaltma formülünün tam hali.
- Oda üretimi (prosedürel mi şablon mu), daralma miktarı, dönme açısı aralığı.
- Yürüme hızı, fener boyutu (~1 m ölçek referansı), ağır çekim hızı.
- Bot yapay zekâsı detayları.
- Ses efektleri ve müzik (absürt tonla uyumlu; telifsiz).
- Sunucu barındırma sağlayıcısı.
- Maç sonu puan eşitliği kuralı.
