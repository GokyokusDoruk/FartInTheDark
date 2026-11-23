# Fart in the Dark — Faz 2: Oda Koduyla Online Oyun — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bir oyuncu "Online → Oda kur" ile 8 kişilik oda açar, oda kodunu paylaşır; diğerleri "Oda koduyla gir" ile katılır; kurucu bot ekleyip maçı başlatır ve maç sunucu otoriter şekilde oynanır.

**Architecture:** Yeni `packages/net` paketi, sunucu ile istemcinin ortak dilidir: mesaj tipleri, giriş doğrulama ve odanın tüm kuralları tek bir saf sınıfta (`RoomHost`), zaman ve gönderme dışarıdan verilir. `apps/server` bu sınıfı bir Cloudflare Durable Object içinde çalıştıran ince bir sarmalayıcıdır (WebSocket Hibernation + alarm + depolama). İstemci artık doğrudan `MatchState` sürmez; sunucudan gelen kişiye özel `PlayerView` mesajlarını çizer. Botlar modu da aynı yolu kullanır: `RoomHost` tarayıcının içinde, oyun döngüsünün saatiyle çalışır (`LocalTransport`). Böylece tek bir oyun ekranı kodu olur.

**Tech Stack:** Faz 1 yığını (TypeScript 5.6.3, Vitest 2.1.8, Vite 6.0.7, three@0.170.0) + `wrangler@4.158.0`, `@cloudflare/workers-types@5.20261108.1` (tam sürüm, `^` yok).

**Spec:** `docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md` (§6.2 ve §7 "Sunucu" / "Online akış detayları")

**Kapsam dışı:** Faz 3 (Capacitor Android APK, iOS bulut derleme kontrolü). Faz 1'den ertelenen küçük kusurlar; bu planın dokunduğu iki tanesi hariç (HUD'da adların kaçışsız basılması, son tur sonunda "Sonraki Tur" yazısı).

## Global Constraints

- Arayüz dili Türkçe; tüm arayüz metinleri `apps/client/src/ui/strings.ts` içinde.
- Oda en fazla **8** katılımcı (insan + bot); maç en az **2** katılımcıyla başlar.
- Hesap yok; takma ad en fazla 14 karakter, kontrol karakterleri atılır, boşsa "Oyuncu".
- **Sunucu otoriter:** `skills` ve `dark` evrelerinde bir oyuncuya giden görünüm başka oyuncuların planını, o anki konumunu, nişanını veya yeteneklerini **içermez**; yalnız `lastSeen` konumları ve can/puan gider. Planlar ve yetenekler yalnız `resolve` görünümünde (`replay`) gönderilir.
- Hareket sunucuda `submitPlan` (`validatePlan`) ile doğrulanır; geçersiz plan başlangıç konumuna düşer.
- Zamanlar (ms): yetenek evresi `SKILL_SECONDS*1000 + 1000`, karanlık `DARK_SECONDS*1000 + 1000` (ağ payı), tur sonu `10000`, boş oda kapanışı `60000`. Herkes yollarsa evre erken biter.
- Görünümlerde mutlak zaman değil `remainingMs` gönderilir (saat farkı).
- `packages/net` içinde `Math.random`, `Date`, DOM, `crypto` yok; saat (`now`) ve rastgelelik (`random`) `RoomHost`'a enjekte edilir.
- Oda kodu 5 karakter, alfabe `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (karışan 0/O, 1/I/L yok). Girilen kod büyük harfe çevrilip boşluklar atılır.
- Durable Object sınıfı `new_sqlite_classes` ile tanımlanır (ücretsiz plan yalnız SQLite destekli DO'ya izin verir).
- Sunucu adresi: `VITE_SERVER_URL`; yoksa geliştirmede `http://127.0.0.1:8787`, yayında `https://fitd-server.dorukplays.com`. (Not: bu makinede `localhost` başka bir projeye gidiyor; her yerde `127.0.0.1`.)
- Kullanıcının e-postası veya kişisel bilgisi hiçbir dosyaya, mesaja, URL'ye girmez.

## Review Focus

1. **Bilgi sızıntısı:** karanlık evrede bir istemcinin aldığı her bayt; rakibin plan konumu/nişanı/yetenekleri orada olmamalı (Task 3 testi: görünüm JSON'unda rakibin plan değerleri aranır).
2. **Maç ortasında kopma ve geri gelme:** karanlık evrede kopan oyuncu bot gibi oynanır; aynı jetonla dönünce kalan süreyle doğru evreye girer; süre geçtiyse başlangıç konumu kullanılır (Task 4 testi).
3. **Kurucu çıkışı / herkesin çıkması:** kurucu çıkınca yöneticilik bağlı ilk insana geçer; hiç insan kalmazsa 60 sn sonra oda kapanır ve botlar sonsuza kadar oynamaz (Task 4 testi).
4. **Kötü niyetli / bozuk mesaj:** 10 KB'lık ad, `NaN`/`Infinity` konum, yanlış evrede plan, kurucu olmayanın `start`/`addBot` göndermesi, bilinmeyen `t` → sessizce yok sayılır ya da `error` döner; oda çökmez (Task 1 ve Task 2 testleri).
5. **İstemci–sunucu sonuç farkı:** istemci gaz animasyonunu kendi motoruyla yeniden oynatır; farklı JS motorunda (Safari) sonuç küçük farklar gösterebilir, bu yüzden animasyon sonunda istemci `replay.after` değerlerine oturur (Task 3 `simulateReplay` eşitlik testi + Task 5 oturtma).

---

## Dosya Yapısı

```
packages/net/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts
  src/protocol.ts     # ClientMsg, ServerMsg, PlayerView, Member, Replay, ErrorCode
  src/validate.ts     # parseClientMsg, cleanName, normalizeCode, makeRoomCode
  src/timing.ts       # evre süreleri + istemci animasyon sabitleri + replayMs()
  src/replay.ts       # buildReplay(), simulateReplay()
  src/host.ts         # RoomHost (lobi + maç akışı + görünümler + snapshot)
  test/*.test.ts
apps/server/
  package.json, tsconfig.json, wrangler.jsonc
  src/worker.ts       # HTTP yönlendirme: POST /api/rooms, GET /api/rooms/:code/ws
  src/gameRoom.ts     # Durable Object: RoomHost'u WebSocket/alarm/depolamaya bağlar
  scripts/smoke.mjs   # wrangler dev'e karşı uçtan uca test (2 istemci + bot)
apps/client/src/
  net/transport.ts    # Transport arayüzü
  net/localTransport.ts
  net/wsTransport.ts  # yeniden bağlanma, jeton saklama
  net/serverUrl.ts
  game/play.ts        # localGame.ts'nin yerine: görünüm güdümlü oyun ekranı
  ui/online.ts        # Online menüsü + lobi ekranı
  ui/hud.ts, ui/menu.ts, ui/strings.ts, main.ts (değişir)
```

---

### Task 1: `packages/net` iskeleti, protokol ve doğrulama

**Files:**
- Create: `packages/net/package.json` (`@fitd/net`, bağımlılık `@fitd/sim: 0.1.0`, `main`/`types` → `src/index.ts`, `test: vitest run`), `tsconfig.json`, `vitest.config.ts` (sim'dekilerin aynısı)
- Create: `packages/net/src/protocol.ts`, `src/validate.ts`, `src/index.ts`
- Modify: kök `package.json` → `test` betiğine `npm -w packages/net test` eklenir (sim ile client arasında)
- Test: `packages/net/test/validate.test.ts`

**Interfaces:**
- Consumes: `@fitd/sim` tipleri (`Difficulty`, `Stats`, `Vec2`, `Room`, `Player`, `Phase`).
- Produces:
```ts
export type ClientMsg =
  | { t: 'addBot'; difficulty: Difficulty } | { t: 'removeBot'; id: string }
  | { t: 'start' } | { t: 'skills'; alloc: Partial<Stats> } | { t: 'plan'; pos: Vec2; aim: number }
  | { t: 'replayDone'; moveSeq: number } | { t: 'next' } | { t: 'leave' };
export type ErrorCode = 'roomNotFound' | 'roomFull' | 'matchRunning' | 'notHost' | 'needTwo' | 'badMessage';
export interface Member { id: string; name: string; isBot: boolean; difficulty?: Difficulty; connected: boolean }
export interface PublicPlayer { id: string; name: string; isBot: boolean; connected: boolean; hp: number; alive: boolean; score: number; pos: Vec2; aim: number }
export interface ReplayAfter { id: string; hp: number; alive: boolean; diedAt: number | null; score: number }
export interface Replay { moveSeq: number; rngState: number; room: Room; players: Player[]; ticks: number; after: ReplayAfter[] }
export interface PlayerView {
  phase: Phase | 'lobby'; round: number; move: number; moveSeq: number; room: Room | null;
  remainingMs: number | null; hostId: string; members: Member[]; players: PublicPlayer[];
  me: { id: string; stats: Stats; unspent: number; start: Vec2; aim: number; alive: boolean } | null;
  replay: Replay | null; roundHistory: Record<string, number>[]; winners: string[] | null;
}
export type ServerMsg =
  | { t: 'welcome'; you: string; token: string; code: string }
  | { t: 'view'; view: PlayerView } | { t: 'error'; code: ErrorCode };
// validate.ts
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeRoomCode(random: () => number): string;   // 5 karakter
export function normalizeCode(raw: string): string | null;     // geçersizse null
export function cleanName(raw: unknown): string;               // ≤14, kontrol karakteri yok, boş → 'Oyuncu'
export function parseClientMsg(raw: string): ClientMsg | null; // JSON değilse / şekli bozuksa null
```

- [ ] **Step 1: Testleri yaz** — `validate.test.ts`:
  - `makeRoomCode` 1000 kez: uzunluk 5, her karakter `CODE_ALPHABET` içinde.
  - `normalizeCode(' ab c2d ')` → `'ABC2D'`; `normalizeCode('ABCD')`, `normalizeCode('ABCD0')` (0 alfabede yok) → `null`.
  - `cleanName('  Doruk\u0000\n ')` → `'Doruk'`; `cleanName('x'.repeat(10000)).length` → `14`; `cleanName('')`, `cleanName(42)` → `'Oyuncu'`.
  - `parseClientMsg`: geçerli her mesaj türü aynen döner; `'{bozuk'`, `'{"t":"zzz"}'`, `{t:'plan',pos:{x:NaN,y:0},aim:0}`, `aim: Infinity`, `pos` eksik, `{t:'addBot',difficulty:'insane'}`, `{t:'skills',alloc:{damage:-1}}`, `alloc` içinde bilinmeyen anahtar, 20 000 karakterlik ham dize → `null`. (JSON `NaN` üretemediği için NaN testi `'{"t":"plan","pos":{"x":"NaN","y":0},"aim":0}'` ve `1e999` ile yapılır.)
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör** — `npm -w packages/net test` → FAIL (modül yok).
- [ ] **Step 3: `protocol.ts`, `validate.ts`, `index.ts`'i yaz.** `parseClientMsg` önce `raw.length > 4096` ise `null`; sayılar `Number.isFinite`; `alloc` değerleri 0–10 tamsayı ve yalnız `STAT_KEYS`.
- [ ] **Step 4: Çalıştır** — `npm -w packages/net test` → PASS; `npm test` → sim 66, net, client 9 geçer.
- [ ] **Step 5: Commit** — `git add packages/net package.json package-lock.json && git commit -m "feat(net): protocol types and input validation"`

---

### Task 2: `RoomHost` — lobi

**Files:**
- Create: `packages/net/src/timing.ts`, `packages/net/src/host.ts`
- Test: `packages/net/test/lobby.test.ts`, `packages/net/test/helpers.ts`

**Interfaces:**
- Consumes: Task 1 tipleri, `cleanName`.
- Produces:
```ts
// timing.ts
export const SKILL_MS: number;      // SKILL_SECONDS*1000 + 1000
export const DARK_MS: number;       // DARK_SECONDS*1000 + 1000
export const ROUND_END_MS = 10_000;
export const EMPTY_CLOSE_MS = 60_000;
export const REVEAL = { lightUp: 0.4, bendLead: 0.5, slowmo: 0.35, after: 1.5 } as const; // istemci de bunu kullanır
export function replayMs(ticks: number): number; // (lightUp+bendLead + ticks*DT/slowmo + after)*1000
export const REPLAY_TIMEOUT = (ticks: number) => replayMs(ticks) * 1.5 + 2000;
// host.ts
export interface HostDeps { code: string; now: () => number; random: () => number; send: (memberId: string, msg: ServerMsg) => void }
export type JoinResult = { ok: true; id: string; token: string } | { ok: false; code: ErrorCode };
export class RoomHost {
  constructor(deps: HostDeps);
  join(name: unknown, token?: string): JoinResult;  // jeton eşleşirse aynı üyeye bağlanır
  connected(id: string): void;                        // welcome + view gönderir
  disconnected(id: string): void;
  handle(id: string, msg: ClientMsg): void;
  tick(): void;                                       // now() ile süresi dolanları işler
  nextDeadline(): number | null;                      // mutlak ms; alarm için
  closed(): boolean;
  snapshot(): HostSnapshot; static restore(snap: HostSnapshot, deps: HostDeps): RoomHost;  // Task 4'te doldurulur
}
```
Kurallar: ilk katılan kurucudur; üye kimlikleri `p1, p2…`, botlar `b1, b2…`, bot adı `Bot 1…`; jeton `random()`'dan 16 karakter; `addBot`/`removeBot`/`start` yalnız kurucu ve yalnız lobide (ya da `matchEnd`'de); toplam > 8 → `roomFull`; maç sürerken jetonsuz katılım → `matchRunning`; `start` < 2 üyeyle → `needTwo`; lobide `leave` üyeyi siler; kurucu ayrılırsa/koparsa yöneticilik bağlı ilk insana geçer. Her değişiklikte tüm bağlı insanlara güncel `view` gider.

- [ ] **Step 1: `helpers.ts`** — sahte saat (`clock.advance(ms)`), sabit tohumlu `random`, gönderilenleri üye başına toplayan `outbox` ve `lastView(id)` yardımcısı.
- [ ] **Step 2: Testleri yaz** — `lobby.test.ts`:
  - ilk katılan `hostId`; ikinci katılan üye listesinde; 1 insanla `start` → `error needTwo`; bot ekleyince `start` kabul (`view.phase === 'skills'`).
  - kurucu olmayan `addBot`/`start` → `error notHost`, üye sayısı değişmez.
  - 8 üye olunca 9. `join` → `{ok:false, code:'roomFull'}`; `addBot` → `roomFull`.
  - kurucu `leave` → `hostId` diğer insana geçer; kurucu `disconnected` → aynı.
  - geçerli jetonla `join` aynı `id`'yi döner; yanlış jetonla yeni üye olur.
  - maç başladıktan sonra jetonsuz `join` → `matchRunning`.
  - `removeBot` botu siler; insan kimliğiyle `removeBot` hiçbir şey yapmaz.
- [ ] **Step 3: Çalıştır, başarısız olduğunu gör.**
- [ ] **Step 4: `timing.ts` ve `RoomHost` lobi kısmını yaz.** `start`, `startMatch({ seed: Math.floor(random()*2**32), players: members.map(...) })` çağırır; maç akışının geri kalanı Task 3'te.
- [ ] **Step 5: Çalıştır** → PASS. **Commit:** `feat(net): room host lobby, host transfer, bots, reconnect tokens`

---

### Task 3: `RoomHost` — maç akışı, kişiye özel görünümler, replay

**Files:**
- Create: `packages/net/src/replay.ts`
- Modify: `packages/net/src/host.ts`
- Test: `packages/net/test/match.test.ts`, `packages/net/test/replay.test.ts`

**Interfaces:**
- Consumes: `@fitd/sim` (`allocateSkills, endSkills, submitPlan, beginResolve, runResolution, finishResolve, nextRound, winners, botAllocate, botPlan, createRng, createResolution, stepResolution, skillsPending`), Task 2.
- Produces:
```ts
export function buildReplay(s: MatchState): Replay;   // beginResolve'dan SONRA, çözülmeden ÖNCE: rngState = s.rng.state(), players derin kopya
export function simulateReplay(r: Replay): { players: Player[]; ticks: number }; // createRng(r.rngState) + createResolution + stepResolution ile sona kadar
export function viewFor(host: RoomHost, id: string): PlayerView; // (host.ts içinde, test için dışa açık)
```
Akış (sunucu tarafı):
- `skills`: botlar ve bağlı olmayan insanlar hemen `botAllocate`; bağlı insan `skills` mesajı gönderince `allocateSkills` (hata → yok say). `skillsPending` içinde bağlı insan kalmayınca ya da `SKILL_MS` dolunca `endSkills` → `dark`.
- `dark`: bağlı insan `plan` gönderince `submitPlan`; tüm bağlı canlı insanlar gönderince ya da `DARK_MS` dolunca botlar ve göndermeyenler için `botPlan`… **dikkat:** bağlı ama plan göndermemiş insan için `botPlan` değil başlangıç konumu kullanılır (sim zaten plansız oyuncuyu yerinde bırakır); yalnız bağlı olmayan insanlar ve botlar `botPlan` alır. Sonra `beginResolve` → `buildReplay` → `runResolution` → `replay.after` doldurulur (puan, `finishResolve` sonrasında değil; `after.score` çözülme sonundaki puandır) → `resolve` görünümü gönderilir.
- `resolve`: tüm bağlı insanlar o `moveSeq` için `replayDone` gönderince ya da `REPLAY_TIMEOUT(ticks)` dolunca `finishResolve` → `skills` / `roundEnd`.
- `roundEnd`: `ROUND_END_MS` sonra ya da kurucunun `next` mesajıyla `nextRound` → `skills` veya `matchEnd` (`winners` doldurulur).
- `matchEnd`: kurucu `start` → aynı üyelerle yeni maç.
- Görünüm kuralı (Global Constraints'teki otoriterlik): `players[].pos/aim` = `skills`/`dark`'ta `s.lastSeen` ve başlangıç nişanı, `resolve` ve sonrasında gerçek değer; `me.start` = `s.moveStart[id]`; `replay` yalnız `resolve`'da; `remainingMs = deadline - now()`.

- [ ] **Step 1: Testleri yaz** — `match.test.ts` (Task 2 yardımcılarıyla):
  - 2 insan + 1 bot: ikisi de `skills` gönderince `dark`'a geçer (süre beklemeden); biri göndermezse `SKILL_MS` sonra geçer ve onun puanları otomatik dağıtılmıştır (`unspent === 0`).
  - **sızıntı:** `dark`'ta B `{pos:P, aim:1.234567}` gönderdikten sonra A'nın son görünümünün `JSON.stringify`'ı `1.234567`'yi, P'nin koordinatlarını ve B'nin `stats` nesnesini içermez; `A.view.players[B].pos` = `lastSeen[B]`.
  - iki insan da plan gönderince `resolve`'a geçer; `view.replay.after` sunucudaki oyuncu değerleriyle aynı.
  - geçersiz plan (start'tan 40 m uzak) → çözülmede oyuncu başlangıç konumunda.
  - `replayDone`'ları gelmezse `REPLAY_TIMEOUT` sonra ilerler; ikisi de gelince hemen ilerler; yanlış `moveSeq`'li `replayDone` sayılmaz.
  - `roundEnd`'de 10 sn sonra yeni tur; kurucunun `next`'i beklemeden geçirir; kurucu olmayanın `next`'i geçirmez.
  - tam maç: insanlar her evrede hemen yanıt veren sahte istemcilerle 2 insan + 2 zor bot `matchEnd`'e ulaşır (en fazla 20 000 `tick`/saat ilerletmesi), `winners` boş değil, `roundHistory.length === 5`.
  - `matchEnd`'de kurucu `start` → `round === 1`, herkesin puanı 0.
  - `replay.test.ts`: 20 farklı tohumla rastgele planlı maç kurulur; her `resolve`'da `simulateReplay(view.replay).players` can/ölüm değerleri `replay.after` ile birebir aynı.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.**
- [ ] **Step 3: `replay.ts` ve maç akışını `host.ts`'e yaz.** Evre geçişleri tek bir `advance()` içinde: süresi dolmuş ya da bekleyeni kalmamış evreyi geçir, döngüyle tekrar dene (art arda atlanan evreler için).
- [ ] **Step 4: Çalıştır** → PASS; `npm test` yeşil. **Commit:** `feat(net): authoritative match flow, per-player views and replays`

---

### Task 4: `RoomHost` — maç ortasında kopma, çıkma, snapshot, oda kapanışı

**Files:**
- Modify: `packages/net/src/host.ts`
- Test: `packages/net/test/resilience.test.ts`

**Interfaces:**
- Produces: `HostSnapshot` (düz JSON: üyeler, jetonlar, kurucu, evre son tarihleri, `MatchState`'in `rng` hariç tümü + `rngState`, bekleyen `replayDone` kümesi, son replay); `snapshot()` / `RoomHost.restore()`.
Kurallar: maçta `disconnected` → üye `connected:false`, hamlelerini bot oynar (insanın `difficulty`'si yok → sim'in kolay botu); aynı jetonla dönünce `connected:true` ve o anki evrenin görünümü (kalan süreyle) gider. Maçta `leave` → üye kalıcı bot olur (`isBot:true`, ad aynı + " (bot)"). Bağlı insan sayısı 0 olunca `EMPTY_CLOSE_MS` sayacı başlar; biri dönerse iptal; dolunca `closed() === true`, sonraki her `join` → `roomNotFound`.

- [ ] **Step 1: Testleri yaz:**
  - A `dark`'ta kopar → `DARK_MS` beklenmeden, B planını gönderince evre biter (A beklenmez) ve A'nın planı `botPlan`'dan gelir (A başlangıçtan farklı bir yerde olabilir; test: A için `submitPlan` çağrıldı → `s.plans[A]` var).
  - A aynı jetonla `dark`'ın 2. saniyesinde döner → A'ya gelen `view.phase === 'dark'`, `remainingMs ≈ DARK_MS-2000` (±50).
  - A `dark` süresi dolduktan sonra döner → `resolve` görünümü alır.
  - maçta kurucu `leave` → `hostId` B olur; A'nın oyuncusu `isBot:true` ve maç sürer.
  - tüm insanlar kopar → 59 sn'de `closed()===false`, 60 sn'de `true`; arada biri dönerse kapanmaz.
  - **snapshot:** maçın her evresinde `RoomHost.restore(JSON.parse(JSON.stringify(h.snapshot())), deps)` sonrası iki sunucu aynı mesajları alıp aynı `view`'leri üretir (aynı tohum → aynı `replay.after`).
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.**
- [ ] **Step 3: Uygula.** `restore` içinde `rng = createRng(snap.rngState)`.
- [ ] **Step 4: Çalıştır** → PASS. **Commit:** `feat(net): disconnects, leavers become bots, snapshot/restore, empty-room close`

---

### Task 5: İstemci — görünüm güdümlü oyun ekranı + botlar modu `LocalTransport` ile

**Files:**
- Create: `apps/client/src/net/transport.ts`, `apps/client/src/net/localTransport.ts`, `apps/client/src/game/play.ts`
- Delete: `apps/client/src/game/localGame.ts` (içeriği `play.ts`'e taşınır)
- Modify: `apps/client/src/ui/hud.ts` (MatchState yerine `PlayerView` alır, adlar `esc` ile), `apps/client/src/ui/menu.ts` (`esc` dışa açılır), `apps/client/src/ui/strings.ts`, `apps/client/src/main.ts`, `apps/client/package.json` (`@fitd/net: 0.1.0`)
- Test: `apps/client/test/localTransport.test.ts`, `apps/client/test/hud.test.ts`

**Interfaces:**
- Consumes: Task 1–4 (`RoomHost`, `PlayerView`, `REVEAL`, `simulateReplay` mantığı).
- Produces:
```ts
export interface Transport {
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): void;
  onStatus?(cb: (s: 'online' | 'reconnecting' | 'lost') => void): void;
  /** Oyun döngüsü her karede çağırır; yalnız LocalTransport kullanır. */
  advance?(dt: number): void;
  close(): void;
}
export function createLocalTransport(opts: StartOptions): Transport; // RoomHost tarayıcıda; saat = advance() toplamı; bot ekler ve başlatır
export function runGame(ui: HTMLElement, gs: GameScene, t: Transport, cb: { onMenu(): void; onAgain?(): void; isHost(): boolean }): { destroy(): void };
```
`play.ts` davranışı (Faz 1 ile aynı görünüm ve his):
- Gelen `view`'ler kuyruğa girer; açık bir replay animasyonu varken sıradaki görünüm bekler.
- `skills`: yetenek ekranı; süre `remainingMs`'ten; onaylayınca `skills` gönderir.
- `dark`: `me.start`'tan yürür (`stepMove(view.room, …)`), süre `min(DARK_SECONDS, remainingMs)` dolunca `plan` gönderir; izleyici 1,5 sn karanlık görür, plan göndermez.
- `resolve`: `replay`'den `createRng(rngState)`, oyuncular kopyalanır, `createResolution`/`stepResolution` ile `REVEAL` zamanlamasıyla ağır çekimde oynatılır; bitince oyuncular `replay.after` değerlerine oturur, `replayDone` gönderilir.
- `roundEnd`: tablo; buton yalnız kurucuda (`next` gönderir), diğerlerinde "Sonraki tur birazdan…" yazısı; son turda buton/yazı `T.seeResults` ("Sonuçları Gör").
- `matchEnd`: kurucuda "Tekrar Oyna" (`start` gönderir), herkeste "Menü" (`leave` + `onMenu`).
- Dev kancası `window.__fitd = { advance, view: () => current, phase }` korunur (`advance` aynı zamanda `transport.advance`'i çağırır).

- [ ] **Step 1: Testleri yaz:**
  - `localTransport.test.ts`: `createLocalTransport({name:'A',bots:3,difficulty:'hard'})`; mesajlara her evrede hemen yanıt veren sahte istemci (`skills` → `{}`, `dark` → `plan` `me.start`, `resolve` → `replayDone`, `roundEnd` → `next`) ve 0,1 sn'lik `advance` adımlarıyla `matchEnd` görünümü gelir.
  - `hud.test.ts` (jsdom değil, string kontrolü): `scoreTable(view, 'p1')` çıktısı `<img src=x onerror=1>` adını kaçışlı içerir (`&#60;img`).
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.**
- [ ] **Step 3: Uygula** (`localGame.ts`'in render/kontrol kodu `play.ts`'e taşınır; sim çağrıları görünüm ve transport mesajlarıyla değişir). `hud.ts`'te tablo HTML'i `scoreTable(view, localId, last?)` olarak dışa açılır.
- [ ] **Step 4: Çalıştır** — `npm test` yeşil, `npm run build` hatasız.
- [ ] **Step 5: Tarayıcıda doğrula** — `npm run dev`, http://127.0.0.1:5173 → Botlarla Oyna (3 bot, zor): tam maç oynanır, konsolda hata yok; görünüm Faz 1 ile aynı (yetenek ekranı, karanlık + fener, domalma, ağır çekim, tur sonu, maç sonu). Gizli sekmede `__fitd.advance` ile sürülebilir.
- [ ] **Step 6: Commit** — `refactor(client): view-driven game screen; bots mode runs RoomHost locally`

---

### Task 6: Sunucu — Cloudflare Worker + Durable Object

**Files:**
- Create: `apps/server/package.json` (`@fitd/server`; bağımlılık `@fitd/net`, `@fitd/sim`; dev: `wrangler@4.158.0`, `@cloudflare/workers-types@5.20261108.1`, `typescript@5.6.3`; betikler `dev: wrangler dev --ip 127.0.0.1 --port 8787`, `deploy: wrangler deploy`, `typecheck: tsc -p .`, `smoke: node scripts/smoke.mjs`)
- Create: `apps/server/tsconfig.json`, `apps/server/wrangler.jsonc`, `apps/server/src/worker.ts`, `apps/server/src/gameRoom.ts`, `apps/server/scripts/smoke.mjs`
- Modify: kök `package.json` → `dev:server`, `smoke` betikleri; `.gitignore` → `.wrangler/`

**Interfaces:**
- Consumes: `RoomHost`, `parseClientMsg`, `makeRoomCode`, `normalizeCode`, `cleanName`.
- Produces (HTTP):
  - `POST /api/rooms` → `200 {"code":"ABCDE"}`. Kod üretilir, `ROOMS.idFromName(code)` stub'ına `POST /init`; DO zaten kurulmuşsa `409` → en fazla 5 kez yeni kod.
  - `GET /api/rooms/:code/ws?name=…&token=…` (Upgrade: websocket) → DO'ya iletilir. Kod geçersiz / oda kurulmamış / kapanmış → bağlantı kabul edilir, `{"t":"error","code":"roomNotFound"}` gönderilip 4004 ile kapatılır (tarayıcı HTTP hata kodunu WebSocket'te göremez). `join` hatası da aynı şekilde (`roomFull`, `matchRunning`).
  - CORS: `POST` için `Origin` izin listesi: `https://fartinthedark.dorukplays.com`, `http://127.0.0.1:5173`, `capacitor://localhost`, `https://localhost`; `OPTIONS` ön isteği yanıtlanır.
- `wrangler.jsonc`: `name: "fitd-server"`, `main: "src/worker.ts"`, `compatibility_date`: kurulu wrangler'ın kabul ettiği en yeni tarih, `durable_objects.bindings: [{ name: "ROOMS", class_name: "GameRoom" }]`, `migrations: [{ tag: "v1", new_sqlite_classes: ["GameRoom"] }]`, `routes: [{ pattern: "fitd-server.dorukplays.com", custom_domain: true }]`.
- `GameRoom` (`DurableObject`'ten türer): kurucuda `ctx.blockConcurrencyWhile` ile `storage.get('snap')` → `RoomHost.restore`. WebSocket Hibernation API (`ctx.acceptWebSocket(ws, [memberId])`, `webSocketMessage`, `webSocketClose`, `webSocketError`); `send(id,msg)` = `ctx.getWebSockets(id)` hepsine `ws.send`. Her olaydan sonra: `storage.put('snap', host.snapshot())` ve `host.nextDeadline()` varsa `storage.setAlarm(deadline)`. `alarm()` → `host.tick()`. `host.closed()` → tüm soketleri kapat, `storage.deleteAll()`. `now = Date.now`, `random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2**32`.

- [ ] **Step 1: `smoke.mjs`'i yaz (bu task'ın başarısız testi):** Node'un yerleşik `WebSocket`'i ile `SERVER` (varsayılan `http://127.0.0.1:8787`):
  1. `POST /api/rooms` → kod; A bağlanır (`name=A`), B aynı kodla bağlanır; A `addBot hard`, `start`.
  2. İki istemci de her `view`'e hemen yanıt verir (Task 5 testindeki sahte istemci davranışı; `roundEnd`'de A `next`).
  3. 2. turun `dark` evresinde B soketini kapatır, 1 sn sonra aynı `token` ile yeniden bağlanır; gelen ilk `view`'in evresi `dark` ya da `resolve`.
  4. 120 sn içinde iki istemci de `matchEnd` alır; ikisinin `players[].score` değerleri aynı; çıkış kodu 0. Aksi halde mesajla çıkış kodu 1.
  5. Yanlış kod (`ZZZZZ`) ile bağlanan istemci `error roomNotFound` alır.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör** — `npm run smoke` → bağlantı reddedildi (sunucu yok).
- [ ] **Step 3: `worker.ts`, `gameRoom.ts`, `wrangler.jsonc`'yi yaz;** `npm install`.
- [ ] **Step 4: Doğrula** — arka planda `npm run dev:server`, sonra `npm run smoke` → `OK` ve çıkış 0; `npm -w apps/server run typecheck` hatasız; `npm test` yeşil.
- [ ] **Step 5: Commit** — `feat(server): Cloudflare Durable Object room server with smoke test`

---

### Task 7: İstemci — Online menüsü, lobi, WebSocket bağlantısı

**Files:**
- Create: `apps/client/src/net/serverUrl.ts`, `apps/client/src/net/wsTransport.ts`, `apps/client/src/ui/online.ts`
- Modify: `apps/client/src/ui/menu.ts` ("Online" butonu açılır), `apps/client/src/ui/strings.ts`, `apps/client/src/main.ts`, `apps/client/src/style.css`
- Test: `apps/client/test/wsTransport.test.ts`

**Interfaces:**
- Consumes: Task 1 (`normalizeCode`, mesaj tipleri), Task 5 (`Transport`, `runGame`), Task 6 HTTP uçları.
- Produces:
```ts
export function serverUrl(): string; // VITE_SERVER_URL ?? (DEV ? 'http://127.0.0.1:8787' : 'https://fitd-server.dorukplays.com')
export async function createRoom(): Promise<string>; // POST /api/rooms → code
export function connectRoom(code: string, name: string, deps?: { WebSocket?: typeof WebSocket; storage?: Storage; setTimeout?: typeof setTimeout }): Transport;
export function showOnline(root: HTMLElement, onBack: () => void, onPlay: (t: Transport, code: string) => void): void;
```
Davranış:
- `connectRoom`: `ws(s)://…/api/rooms/CODE/ws?name=…&token=…`; `welcome` gelince jetonu `localStorage['fitd.token.'+code]`'a yazar. Beklenmeyen kapanmada 1, 2, 4, 8, 8 sn aralıkla 5 deneme (`onStatus('reconnecting')`), sonra `'lost'`. `error` ile gelen kapanmada yeniden denemez. `leave` gönderip kapatınca jeton silinir.
- Online ekranı: ad alanı (botlar ekranıyla aynı kayıtlı ad), "Oda Kur", kod alanı + "Oda Koduyla Gir", "Geri". URL'de `?oda=ABCDE` varsa kod alanı dolu gelir.
- Lobi ekranı (görünüm `phase === 'lobby'` iken): büyük oda kodu, "Paylaş" (`navigator.share` varsa onunla, yoksa panoya kopyalar; metin `fartinthedark.dorukplays.com/?oda=CODE` bağlantısını içerir), üye listesi (renk noktası, ad — `esc` ile, bot etiketi, bağlantı durumu, kurucu tacı). Kurucu: zorluk seçimi + "Bot Ekle" (8'de pasif), botların yanında ×, "Başlat" (< 2 üyede pasif). Diğerleri: "Kurucunun başlatması bekleniyor…". "Odadan Çık".
- `phase !== 'lobby'` görünümü gelince `runGame` açılır; `matchEnd` sonrası kurucu `start` derse yeni maç aynı ekranda başlar.
- Hata metinleri (strings.ts): `roomNotFound` "Böyle bir oda yok ya da kapandı.", `roomFull` "Oda dolu (8 kişi).", `matchRunning` "Bu odada maç sürüyor, bitince tekrar dene.", `needTwo` "Başlatmak için en az 2 oyuncu lazım.", `notHost` "Bunu sadece odayı kuran yapabilir.", bağlantı: "Bağlantı koptu, yeniden bağlanılıyor…", "Sunucuya ulaşılamadı.".

- [ ] **Step 1: Testleri yaz** — `wsTransport.test.ts`, sahte `WebSocket` sınıfıyla: `welcome` → jeton saklanır; beklenmeyen `close` → 1 sn sonra jetonlu URL ile yeni soket; 5 başarısız denemeden sonra `'lost'`; `error` sonrası kapanmada yeni soket açılmaz; `leave` → jeton silinir.
- [ ] **Step 2: Çalıştır, başarısız olduğunu gör.**
- [ ] **Step 3: Uygula.**
- [ ] **Step 4: Çalıştır** — `npm test` yeşil, `npm run build` hatasız.
- [ ] **Step 5: Tarayıcıda doğrula** (arka planda `npm run dev:server` ve `npm run dev`): iki sekme (biri telefon görünümünde). Sekme 1 oda kurar, sekme 2 kodla girer; kurucu 1 bot ekler, başlatır; iki sekmede de karanlıkta rakip görünmez, ışıklar yanınca aynı sonuç; sekme 2'yi yenile → aynı maça geri döner; maç sonunda "Tekrar Oyna". Yanlış kodla girişte Türkçe hata. Konsolda hata yok.
- [ ] **Step 6: Commit** — `feat(client): online menu, lobby and reconnecting WebSocket transport`

---

### Task 8: Belgeler ve yayın hazırlığı

**Files:**
- Modify: `README.md`, `apps/client/public/_headers` (gerekirse `connect-src`'ye sunucu adresi; şu an CSP yoksa dokunulmaz)

- [ ] **Step 1: README'ye ekle** (Türkçe): yapı tablosuna `packages/net` ve `apps/server`; "Online'ı bilgisayarda çalıştırma" (`npm run dev:server` + `npm run dev`, iki sekme); "Sunucu yayını" adımları — kullanıcının yapacakları: `npx -w apps/server wrangler login`, `npm -w apps/server run deploy` (ilk yayında `fitd-server.dorukplays.com` özel alan adı kendiliğinden bağlanır; dorukplays.com aynı Cloudflare hesabında olmalı), Cloudflare Pages ortam değişkeni gerekmez (yayın adresi koda gömülü), ücretsiz plan kotaları ve aşılınca ne olacağı (o gün yeni oda açılamaz). Faz 1'den kalan "http://localhost:5173" → "http://127.0.0.1:5173".
- [ ] **Step 2: Doğrula** — `npm test` yeşil, `npm run build` hatasız, `npm run smoke` (sunucu açıkken) OK.
- [ ] **Step 3: Commit** — `docs: online play and server deploy instructions`
