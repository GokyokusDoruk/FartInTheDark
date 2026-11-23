# Fart in the Dark — Faz 1: Botlarla Oynanan Web Oyunu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarayıcıda (telefon + masaüstü) botlara karşı baştan sona oynanabilen tam bir maç (5 tur, hamleler, yetenekler, karanlık, gaz, puan).

**Architecture:** npm workspaces monorepo. `packages/sim` render'dan bağımsız, deterministik, saf TypeScript oyun motorudur (oda, hareket, gaz, maç akışı, botlar); Faz 2'de sunucu da aynı paketi kullanacak. `apps/client` Vite + Three.js ile simülasyonu çizer, dokunmatik/klavye girişini alır, DOM ile arayüzü gösterir.

**Tech Stack:** Node 20+, TypeScript 5.6, Vitest 2.1, Vite 6, three@0.170.0.

**Spec:** `docs/superpowers/specs/2026-11-23-fart-in-the-dark-design.md`

**Sonraki planlar (bu planın kapsamı dışında):**
- Faz 2: `apps/server` (Colyseus), oda kodu, online oyun, kurucu devri, çıkanın yerine bot, sunucu doğrulaması.
- Faz 3: Capacitor ile Android APK + iOS bulut derleme kontrolü; Cloudflare Pages + sunucu yayını.

## Global Constraints

- Arayüz dili Türkçe; tüm arayüz metinleri `apps/client/src/ui/strings.ts` içinde tek yerde.
- Oyun mantığı 2B (x,y düzlemi, birim = metre); render 3B, kamera yukarıdan çapraz, dikey ekran öncelikli.
- `packages/sim` içinde `Math.random`, `Date`, DOM, three **kullanılamaz**; tüm rastgelelik `rng.ts`'deki tohumlu üreteçten gelir.
- Sabit zaman adımı: `TICK_HZ = 30`, `DT = 1/30`.
- Maç: 5 tur. Can: 100. Hamle başına 5 yetenek puanı, özellik başına en fazla 10, tur başında sıfırlanır. Yetenek süresi 15 sn, karanlık süresi 5 sn.
- Oyuncu kendi gazından/partikülünden hasar almaz.
- Balans sabitlerinin hepsi `packages/sim/src/config.ts` içinde.
- Bot sayısı 1–7, zorluk `'easy' | 'medium' | 'hard'`.

## Review Focus

1. Oda dönüp daraldıktan sonra duvar içinde veya sınır dışında kalan oyuncu → en yakın geçerli noktaya taşınmalı (Task 4 testi).
2. Duvara yakın duran oyuncunun gazı tek adımda duvarın içinden geçmemeli (tünelleme) → seker (Task 6 testi).
3. Aynı tick'te kalan herkes ölürse → tur hayatta kalan olmadan biter, ölenler aynı sırayı paylaşır (Task 7 testi).
4. Tüm özellikleri 10 olan oyuncu → yetenek evresi onu beklemez; herkes doluysa evre atlanır (Task 2 ve Task 8 testleri).
5. Telefonda iki parmak aynı anda (sol yürüme + sağ nişan) → iki analog birbirini bozmamalı; ekran döndürme/yeniden boyutlandırmada analoglar doğru yerde kalmalı (Task 11 elle doğrulama).

---

## Dosya Yapısı

```
package.json                      # workspaces: packages/*, apps/*
tsconfig.base.json
packages/sim/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                    # tüm dışa aktarımlar
  src/vec.ts                      # 2B vektör ve çokgen geometrisi
  src/rng.ts                      # tohumlu RNG
  src/config.ts                   # tüm sabitler ve özellik eğrileri
  src/types.ts                    # ortak tipler
  src/stats.ts                    # yetenek puanı dağıtımı
  src/roomgen.ts                  # oda üretimi + doğuş noktaları
  src/room.ts                     # döndürme, daraltma, oyuncu itme
  src/movement.ts                 # yürüme + çarpışma + plan doğrulama
  src/gas.ts                      # bulut/partikül üretimi ve bir tick ilerletme
  src/resolve.ts                  # çözülme (tüm bulutlar ölene kadar)
  src/scoring.ts                  # ölüm sırası → puan
  src/match.ts                    # maç durum makinesi
  src/bots.ts                     # bot yetenek ve plan seçimi
  test/*.test.ts
apps/client/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.ts                     # ekran yönlendirme
  src/ui/strings.ts               # Türkçe metinler
  src/ui/menu.ts                  # ana menü + bot kurulumu
  src/ui/skills.ts                # yetenek ekranı
  src/ui/hud.ts                   # sayaç, tur/puan, sonuç ekranları
  src/input/joystick.ts           # sanal analog (saf matematik + DOM)
  src/input/controls.ts           # analog + klavye/fare birleştirme
  src/render/scene.ts             # three sahne, kamera, ışıklar, karanlık/fener
  src/render/roomView.ts          # oda, duvar, boru, bölge mesh'leri
  src/render/character.ts         # prosedürel absürt karakter + pozlar + yüz rengi
  src/render/gasView.ts           # bulut ve partikül görselleri
  src/render/hpBar.ts             # can barı sprite'ı
  src/game/localGame.ts           # maç akışını zamanlayıcılarla sürer (bot modu)
  test/*.test.ts                  # sadece saf yardımcılar
```

---

### Task 1: Monorepo iskeleti, vektör geometrisi, tohumlu RNG

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `packages/sim/{package.json,tsconfig.json,vitest.config.ts}`, `packages/sim/src/{vec.ts,rng.ts,types.ts,index.ts}`
- Test: `packages/sim/test/vec.test.ts`, `packages/sim/test/rng.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type Vec2 = { x: number; y: number }`, `type Poly = Vec2[]` (dışbükey, saat yönü tersine)
- Produces (`vec.ts`): `add, sub, scale(v,k), len, norm, dot, rotate(v, rad, about?: Vec2), fromAngle(rad): Vec2, angleOf(v): number, reflect(dir, normal): Vec2, pointInPoly(p, poly): boolean, closestPointOnPoly(p, poly): Vec2, circleHitsPoly(c, r, poly): {normal: Vec2, depth: number} | null, segmentHitsPoly(a, b, poly): {t: number, normal: Vec2} | null`
- Produces (`rng.ts`): `type Rng = { next(): number /*[0,1)*/; int(min, maxIncl): number; range(min, max): number; pick<T>(arr: T[]): T; state(): number }`, `createRng(seed: number): Rng` (mulberry32)

- [ ] **Step 1: Kökte `package.json` (`"private": true, "workspaces": ["packages/*","apps/*"], scripts: { "test": "npm -w packages/sim test", "dev": "npm -w apps/client run dev" }`), `tsconfig.base.json` (strict, ES2022, moduleResolution bundler), `.gitignore` (node_modules, dist). `packages/sim/package.json`: ad `@fitd/sim`, `"main": "src/index.ts"`, devDeps `typescript@5.6.3 vitest@2.1.8`, script `"test": "vitest run"`.**
- [ ] **Step 2: Failing testler yaz**

```ts
// vec.test.ts
expect(reflect({x:1,y:-1},{x:0,y:1})).toEqual({x:1,y:1});
const sq = [{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}];
expect(pointInPoly({x:1,y:1}, sq)).toBe(true);
expect(pointInPoly({x:3,y:1}, sq)).toBe(false);
expect(closestPointOnPoly({x:3,y:1}, sq)).toEqual({x:2,y:1});
expect(segmentHitsPoly({x:-1,y:1},{x:1,y:1}, sq)).toEqual({t:0.5, normal:{x:-1,y:0}});
expect(circleHitsPoly({x:2.3,y:1}, 0.5, sq)?.normal).toEqual({x:1,y:0});
const r = rotate({x:1,y:0}, Math.PI/2); expect(r.x).toBeCloseTo(0); expect(r.y).toBeCloseTo(1);
// rng.test.ts
const a = createRng(42), b = createRng(42);
expect([a.next(),a.next()]).toEqual([b.next(),b.next()]);
expect(createRng(1).next()).not.toBe(createRng(2).next());
for (let i=0;i<1000;i++){ const n=a.int(1,3); expect(n>=1&&n<=3).toBe(true); }
```

- [ ] **Step 3: `npm install` sonra `npm test` → FAIL (modüller yok)**
- [ ] **Step 4: `vec.ts`, `rng.ts`, `types.ts`'yi uygula; `index.ts` hepsini dışa aktarsın**
- [ ] **Step 5: `npm test` → PASS**
- [ ] **Step 6: Commit** `feat(sim): monorepo scaffold, vector geometry, seeded rng`

---

### Task 2: Sabitler, özellik eğrileri, yetenek puanı dağıtımı

**Files:**
- Create: `packages/sim/src/config.ts`, `packages/sim/src/stats.ts`; Modify: `types.ts`, `index.ts`
- Test: `packages/sim/test/stats.test.ts`

**Interfaces:**
- Produces (`types.ts`): `type StatKey = 'thickness'|'scatter'|'range'|'damage'|'power'|'duration'`, `const STAT_KEYS: StatKey[]` (bu sırayla), `type Stats = Record<StatKey, number>`
- Produces (`config.ts`): `TICK_HZ=30, DT=1/30, ROUNDS=5, MAX_HP=100, POINTS_PER_MOVE=5, MAX_STAT=10, SKILL_SECONDS=15, DARK_SECONDS=5, MOVE_SPEED=3 /*m/s*/, PLAYER_RADIUS=0.35, GAS_SPEED=4 /*m/s*/, FLASHLIGHT_RANGE=1 /*m*/, SHRINK_PER_MOVE=0.98, CLASH_DAMPING=0.5`, `gasParams(s: Stats): { radius: number; range: number; dps: number; power: number; life: number; particlesPerSec: number; particleDps: number }` — başlangıç eğrileri: radius `0.5+0.1·thickness`, range `5+1·range`, dps `20+5·damage`, power `1+power`, life `2+0.3·duration` sn, particlesPerSec `1.5·scatter`, particleDps `0.4·dps`. (Balans builder'ındır; değerler sadece buradan değişir.)
- Produces (`stats.ts`): `emptyStats(): Stats`, `grantPoints(stats: Stats): number` (verilecek puan = `min(POINTS_PER_MOVE, kalan kapasite)`), `allocate(stats: Stats, unspent: number, alloc: Partial<Stats>): { stats: Stats; unspent: number }` (geçersizse `Error` fırlatır), `autoAllocate(stats: Stats, unspent: number, rng: Rng): { stats: Stats; unspent: 0 }`

- [ ] **Step 1: Failing testler**

```ts
expect(grantPoints(emptyStats())).toBe(5);
const full = Object.fromEntries(STAT_KEYS.map(k=>[k,10])) as Stats;
expect(grantPoints(full)).toBe(0);                       // Review Focus 4
expect(grantPoints({...full, power: 7})).toBe(3);
const r = allocate(emptyStats(), 5, { damage: 3, range: 2 });
expect(r.stats.damage).toBe(3); expect(r.unspent).toBe(0);
expect(() => allocate(emptyStats(), 5, { damage: 6 })).toThrow();       // fazla puan
expect(() => allocate({...emptyStats(), damage: 9}, 5, { damage: 2 })).toThrow(); // 10'u aşma
expect(() => allocate(emptyStats(), 5, { damage: -1 })).toThrow();
const a = autoAllocate({...emptyStats(), damage: 10}, 5, createRng(1));
expect(STAT_KEYS.reduce((s,k)=>s+a.stats[k],0)).toBe(15); expect(a.stats.damage).toBe(10);
expect(gasParams(emptyStats()).dps).toBe(20);
```

- [ ] **Step 2: `npm test` → FAIL**
- [ ] **Step 3: Uygula**
- [ ] **Step 4: `npm test` → PASS**
- [ ] **Step 5: Commit** `feat(sim): config, gas stat curves, skill point allocation`

---

### Task 3: Oda modeli ve üretimi, doğuş noktaları

**Files:**
- Create: `packages/sim/src/roomgen.ts`; Modify: `types.ts`, `index.ts`
- Test: `packages/sim/test/roomgen.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `interface Pipe { inlet: Vec2; outlet: Vec2; outDir: Vec2 /*birim*/; radius: number }`
  - `type ZoneKind = 'grow'|'shrink'|'redirect'`; `interface Zone { kind: ZoneKind; center: Vec2; radius: number; turn?: number /*rad, sadece redirect*/ }`
  - `interface Room { center: Vec2; bounds: Poly; walls: Poly[]; pipes: Pipe[]; zones: Zone[] }`
- Produces (`roomgen.ts`): `ROOM_W=14, ROOM_H=20`, `generateRoom(rng: Rng): Room` (sınır dikdörtgeni; 4–7 dikdörtgen duvar/eşya 1–3 m kenarlı; 1–2 boru; 1–3 bölge, her türden en az birinin çıkma ihtimali; bölgeler/borular duvarla çakışmaz), `spawnPoints(room: Room, count: number, rng: Rng): Vec2[]` (her nokta sınır içinde, hiçbir duvarın `PLAYER_RADIUS` yakınında değil; birbirine en uzak dağılım: aday örnekle, en küçük mesafeyi en büyütenleri seç).

- [ ] **Step 1: Failing testler**

```ts
for (let seed=1; seed<=50; seed++){
  const rng = createRng(seed); const room = generateRoom(rng);
  expect(room.walls.length).toBeGreaterThanOrEqual(4); expect(room.walls.length).toBeLessThanOrEqual(7);
  expect(room.pipes.length).toBeGreaterThanOrEqual(1);
  const pts = spawnPoints(room, 8, rng);
  expect(pts).toHaveLength(8);
  for (const p of pts){
    expect(pointInPoly(p, room.bounds)).toBe(true);
    for (const w of room.walls) expect(circleHitsPoly(p, PLAYER_RADIUS, w)).toBeNull();
  }
  for (let i=0;i<8;i++) for (let j=i+1;j<8;j++) expect(len(sub(pts[i],pts[j]))).toBeGreaterThan(3);
}
expect(generateRoom(createRng(7))).toEqual(generateRoom(createRng(7)));  // deterministik
```

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): procedural room generation and spawn points`

---

### Task 4: Oda dönüşümleri ve oyuncu hareketi

**Files:**
- Create: `packages/sim/src/room.ts`, `packages/sim/src/movement.ts`; Modify: `index.ts`
- Test: `packages/sim/test/room.test.ts`, `packages/sim/test/movement.test.ts`

**Interfaces:**
- Produces (`room.ts`): `rotateRoom(room: Room, rad: number): Room` (sınır hariç her şey + sınır, `room.center` etrafında döner; yeni nesne döner), `shrinkRoom(room: Room, factor: number): Room` (tüm noktalar merkeze doğru ölçeklenir; boru/bölge yarıçapları değişmez), `findValidPos(room: Room, p: Vec2): Vec2` (p geçerliyse aynısı; değilse en yakın, sınır içinde ve duvardan `PLAYER_RADIUS` uzak nokta — spiral örnekleme 0.1 m adım), `transformForNewMove(room: Room, positions: Vec2[], rng: Rng): { room: Room; positions: Vec2[] }` (rastgele açı `[0, 2π)` ile döndür, `SHRINK_PER_MOVE` ile daralt, her pozisyonu `findValidPos`)
- Produces (`movement.ts`): `stepMove(room: Room, pos: Vec2, input: Vec2 /*|input|≤1*/, dt: number): Vec2` (duvar ve sınır boyunca kayarak), `validatePlan(room: Room, start: Vec2, plan: { pos: Vec2 }): boolean` (mesafe ≤ `MOVE_SPEED·DARK_SECONDS + 0.05` ve konum geçerli)

- [ ] **Step 1: Failing testler**

```ts
// room.test.ts
const room = generateRoom(createRng(3));
const r90 = rotateRoom(room, Math.PI/2);
const w0 = room.walls[0][0], w1 = r90.walls[0][0];
expect(len(sub(w1, room.center))).toBeCloseTo(len(sub(w0, room.center)));
// Review Focus 1: duvar içinde kalan oyuncu en yakın geçerli noktaya
const inside = centroid(room.walls[0]);           // test içinde ortalama ile hesapla
const fixed = findValidPos(room, inside);
expect(room.walls.every(w => circleHitsPoly(fixed, PLAYER_RADIUS, w) === null)).toBe(true);
expect(len(sub(fixed, inside))).toBeLessThan(3);
const outside = { x: 1000, y: 1000 };
expect(pointInPoly(findValidPos(room, outside), room.bounds)).toBe(true);
const t = transformForNewMove(room, spawnPoints(room, 4, createRng(1)), createRng(9));
for (const p of t.positions) expect(findValidPos(t.room, p)).toEqual(p);
// movement.test.ts
let p = { x: 1, y: 1 }; const empty: Room = { ...room, walls: [] };
for (let i=0;i<30;i++) p = stepMove(empty, p, {x:1,y:0}, DT);
expect(p.x).toBeCloseTo(1 + MOVE_SPEED, 1);
expect(validatePlan(empty, {x:1,y:1}, { pos: {x:1+MOVE_SPEED*DARK_SECONDS+1, y:1} })).toBe(false);
```
(Sınırdaki duvara doğru yürüme testi: oyuncu sınırdan dışarı çıkmaz ve duvara paralel kayar.)

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): room rotate/shrink, valid-position push-out, movement`

---

### Task 5: Gaz — bulut, menzil, ömür, hasar, saçılma

**Files:**
- Create: `packages/sim/src/gas.ts`; Modify: `types.ts`, `index.ts`
- Test: `packages/sim/test/gas.test.ts`

**Interfaces:**
- Consumes: `gasParams`, `Room`, `Rng`, `Player`
- Produces (`types.ts`):
  - `type Difficulty = 'easy'|'medium'|'hard'`
  - `interface Player { id: string; name: string; isBot: boolean; difficulty?: Difficulty; pos: Vec2; aim: number /*rad, gazın gittiği yön*/; hp: number; alive: boolean; stats: Stats; unspent: number; diedAt: number | null; score: number }`
  - `interface Cloud { id: number; owner: string; pos: Vec2; dir: Vec2; radius: number; dps: number; power: number; travelled: number; range: number; age: number; life: number; alive: boolean }`
  - `interface Particle { owner: string; pos: Vec2; vel: Vec2; radius: number; dps: number; age: number; life: number; alive: boolean }`
- Produces (`gas.ts`): `spawnCloud(p: Player, id: number): Cloud` (oyuncunun `pos + dir·(PLAYER_RADIUS+radius)` noktasından, `dir = fromAngle(p.aim)`), `stepGas(clouds: Cloud[], particles: Particle[], room: Room, players: Player[], rng: Rng, dt: number): void` (yerinde değiştirir). Bu task'ta: hareket (`travelled < range` iken `GAS_SPEED` ile; menzil dolunca durur), `age += dt`, `age ≥ life` → `alive=false`; sahibi olmayan **her** canlı oyuncuya, bulutla çakışıyorsa `dps·dt` hasar (birden çok oyuncu aynı anda); saçılma: `particlesPerSec·dt` beklenen sayıda partikül, yön `dir`'e dik ±, hız 1.5 m/s, ömür 0.8 sn, yarıçap 0.15. `hp ≤ 0` → `hp=0`, `alive=false` (ölüm zamanı Task 7'de).

- [ ] **Step 0: `packages/sim/test/helpers.ts` oluştur (sonraki task'lar da kullanır): `mkPlayer(id, pos, aim, stats = emptyStats()): Player` (100 can, canlı), `rect(x1,y1,x2,y2): Poly`, `centroid(poly): Vec2`, `run(fn: () => void, seconds: number)` (`seconds/DT` kez çağırır), `empty: Room` (14×20 sınır, duvarsız, borusuz, bölgesiz), `aimAtOther(s: MatchState, p: Player): number`.**
- [ ] **Step 1: Failing testler** (duvarsız odada)

```ts
const A = mkPlayer('A', {x:2,y:10}, 0), B = mkPlayer('B', {x:5,y:10}, Math.PI), C = mkPlayer('C', {x:7,y:10}, Math.PI/2);
const clouds = [spawnCloud(A, 1)]; const parts: Particle[] = [];
run(() => stepGas(clouds, parts, empty, [A,B,C], createRng(1), DT), 4 /*sn*/);
expect(B.hp).toBeLessThan(100); expect(C.hp).toBeLessThan(100);  // durmadan devam eder, ikisini de vurur
expect(A.hp).toBe(100);                                            // kendi gazı
expect(clouds[0].travelled).toBeCloseTo(gasParams(A.stats).range, 1); // menzilde durur
run(..., 10); expect(clouds[0].alive).toBe(false);                // ömür biter
const hpAfter = B.hp; run(..., 2); expect(B.hp).toBe(hpAfter);    // ölü bulut hasar vermez
// saçılma
const S = mkPlayer('S', {x:2,y:10}, 0, { ...emptyStats(), scatter: 10 }); const ps: Particle[] = [];
run(() => stepGas([spawnCloud(S,2)], ps, empty, [S], createRng(1), DT), 1);
expect(ps.length).toBeGreaterThan(5);
const Z = mkPlayer('Z', {x:2,y:10}, 0); const zs: Particle[] = [];
run(() => stepGas([spawnCloud(Z,3)], zs, empty, [Z], createRng(1), DT), 1);
expect(zs.length).toBe(0);
```

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): gas clouds with range, lifetime, multi-target damage, scatter`

---

### Task 6: Gaz etkileşimleri — sekme, boru, bölgeler, gaz–gaz çarpışması

**Files:**
- Modify: `packages/sim/src/gas.ts`
- Test: `packages/sim/test/gasInteractions.test.ts`

**Interfaces:**
- Produces: davranış `stepGas` içinde; ek dışa aktarım yok. Kurallar:
  - **Sekme:** bulut merkezi bu tick `pos → pos + dir·GAS_SPEED·dt` segmenti bir duvar/sınır kenarına çarparsa `segmentHitsPoly` ile çarpma noktası bulunur, `dir = reflect(dir, normal)`, kalan yol yeni yönde gidilir (tick başına en fazla 3 sekme). Sınır içten çarpılan bir duvar gibi davranır. Partiküller duvara çarpınca ölür.
  - **Boru:** bulut merkezi `inlet`'e `radius` içinde girerse → `pos = outlet`, `dir = outDir`; aynı boru 0.3 sn boyunca aynı bulutu tekrar almaz.
  - **Bölge:** bulut merkezi bölgeye girdiği tick bir kez: `grow` → `radius·1.5`, `dps·1.3`; `shrink` → `radius·0.6`, `dps·0.7`; `redirect` → `dir = rotate(dir, turn)`. Aynı bölge aynı buluta bir kez etki eder (`Cloud`'a `touched: Set<string>` eklenir; bölge/boru anahtarı indeksle).
  - **Gaz–gaz:** farklı sahipli iki canlı bulut çakışırsa (çift başına bir kez): güçler eşitse ikisi de ölür; değilse zayıf ölür, güçlü `dps *= 1 − (zayıf.power / güçlü.power)·CLASH_DAMPING`.

- [ ] **Step 1: Failing testler**

```ts
// sekme: x=6'da dikey duvar, bulut +x'e gidiyor → -x'e döner
const wallRoom = { ...empty, walls: [rect(6, 0, 7, 20)] };
const c = spawnCloud(mkPlayer('A',{x:5,y:10},0),1);
run(() => stepGas([c],[],wallRoom,[],createRng(1),DT), 1);
expect(c.dir.x).toBeLessThan(0);
// Review Focus 2: tünelleme yok — duvara 0.05 m yakın, ince (0.2 m) duvar, yüksek dt
const thin = { ...empty, walls: [rect(6, 0, 6.2, 20)] };
const c2 = spawnCloud(mkPlayer('A',{x:5.3,y:10},0),2);
stepGas([c2],[],thin,[],createRng(1), 0.5);
expect(c2.pos.x).toBeLessThan(6);
// boru
const pipeRoom = { ...empty, pipes: [{ inlet:{x:5,y:10}, outlet:{x:2,y:3}, outDir:{x:0,y:-1}, radius:0.5 }] };
const c3 = spawnCloud(mkPlayer('A',{x:3,y:10},0),3);
run(() => stepGas([c3],[],pipeRoom,[],createRng(1),DT), 1);
expect(c3.dir).toEqual({x:0,y:-1}); expect(c3.pos.y).toBeLessThan(3);
// bölgeler
const g = spawnCloud(mkPlayer('A',{x:3,y:10},0),4); const r0 = g.radius;
run(() => stepGas([g],[],{...empty, zones:[{kind:'grow',center:{x:5,y:10},radius:0.5}]},[],createRng(1),DT), 1);
expect(g.radius).toBeCloseTo(r0*1.5);                     // bir kez
// gaz–gaz
const strong = spawnCloud(mkPlayer('A',{x:2,y:10},0,{...emptyStats(),power:6}),5);
const weak = spawnCloud(mkPlayer('B',{x:8,y:10},Math.PI,{...emptyStats(),power:2}),6);
const d0 = strong.dps;
run(() => stepGas([strong,weak],[],empty,[],createRng(1),DT), 2);
expect(weak.alive).toBe(false); expect(strong.alive).toBe(true);
expect(strong.dps).toBeCloseTo(d0 * (1 - (3/7)*CLASH_DAMPING));
// eşit güç → ikisi de ölür
```

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): wall bounce, pipes, zones, gas-vs-gas clash`

---

### Task 7: Çözülme ve puanlama

**Files:**
- Create: `packages/sim/src/resolve.ts`, `packages/sim/src/scoring.ts`; Modify: `gas.ts` (ölüm zamanı), `index.ts`
- Test: `packages/sim/test/resolve.test.ts`, `packages/sim/test/scoring.test.ts`

**Interfaces:**
- Produces (`resolve.ts`): `interface Resolution { moveSeq: number; tick: number; clouds: Cloud[]; particles: Particle[]; done: boolean }`, `createResolution(players: Player[], moveSeq: number): Resolution` (her canlı oyuncu için bir bulut), `stepResolution(res: Resolution, room: Room, players: Player[], rng: Rng): void` (bir tick; ölen oyuncuya `diedAt = moveSeq·1_000_000 + tick`; canlı bulut ve partikül kalmayınca `done=true`), `runResolution(...)`: `done` olana kadar adımlar (güvenlik sınırı 60 sn).
- Produces (`scoring.ts`): `roundPoints(players: Player[]): Record<string, number>` — N oyuncu; hayatta kalan N puan; ölenler `diedAt`'a göre sıralanır; sıra `i` (0 tabanlı) için puan `i+1`; aynı `diedAt`'e sahip grup, grubun **ilk** sırasının puanını paylaşır.

- [ ] **Step 1: Failing testler**

```ts
// scoring
const ps = (d: (number|null)[]) => d.map((diedAt,i)=>({ ...mkPlayer('P'+i,{x:0,y:0},0), diedAt, alive: diedAt===null }));
expect(roundPoints(ps([5, 9, 9, null]))).toEqual({P0:1, P1:2, P2:2, P3:4});   // spec örneği 1-2-2-4
expect(roundPoints(ps([3, 1, null]))).toEqual({P0:2, P1:1, P2:3});
expect(roundPoints(ps([7, 7]))).toEqual({P0:1, P1:1});                     // Review Focus 3: herkes aynı anda
// resolve: iki oyuncu karşı karşıya, yüksek hasar → biter, done olur, diedAt atanır
const A = mkPlayer('A',{x:3,y:10},0,{...emptyStats(),damage:10,duration:10}); A.hp=10;
const B = mkPlayer('B',{x:6,y:10},Math.PI,{...emptyStats(),damage:10,duration:10}); B.hp=10;
const res = createResolution([A,B], 2); runResolution(res, empty, [A,B], createRng(1));
expect(res.done).toBe(true); expect(A.alive||B.alive).toBe(false);
expect(Math.floor(A.diedAt!/1_000_000)).toBe(2);
```

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): move resolution and round scoring with shared ties`

---

### Task 8: Maç durum makinesi

**Files:**
- Create: `packages/sim/src/match.ts`; Modify: `index.ts`
- Test: `packages/sim/test/match.test.ts`

**Interfaces:**
- Consumes: Task 2–7'nin hepsi
- Produces:
  - `type Phase = 'skills'|'dark'|'resolve'|'roundEnd'|'matchEnd'`
  - `interface MatchConfig { seed: number; players: { id: string; name: string; isBot: boolean; difficulty?: Difficulty }[] }` (2–8 oyuncu, değilse `Error`)
  - `interface MatchState { config: MatchConfig; phase: Phase; round: number /*1..5*/; move: number /*tur içinde 1..*/; moveSeq: number /*maç boyu*/; room: Room; players: Player[]; rng: Rng; resolution: Resolution | null; plans: Record<string, { pos: Vec2; aim: number }>; roundHistory: Record<string, number>[]; lastSeen: Record<string, Vec2> }` (`lastSeen`: her `endSkills` sonunda, oda dönüşümünden sonra herkesin konumunun kopyası; botlar sadece bunu kullanır)
  - `startMatch(cfg): MatchState` → tur 1, `startRound` çağrılır
  - `allocateSkills(s, id, alloc: Partial<Stats>): void`
  - `skillsPending(s): string[]` (canlı ve `unspent>0` olanlar)
  - `endSkills(s): void` → kalanlara `autoAllocate`, `transformForNewMove`, `phase='dark'`
  - `submitPlan(s, id, plan): void` → `validatePlan` geçmezse başlangıç konumu kullanılır, `aim` her zaman alınır
  - `beginResolve(s): void` → planları uygula (gönderilmemişse yerinde kal, son `aim`), `createResolution`, `phase='resolve'`
  - `finishResolve(s): void` → çözülme bitmiş olmalı; canlı ≤ 1 ise `roundPoints` puanlara eklenir, `roundHistory`'ye yazılır, `phase='roundEnd'`; değilse `move++`, `moveSeq++`, canlılara `grantPoints`, `skillsPending` boşsa doğrudan `endSkills`, değilse `phase='skills'`
  - `nextRound(s): void` → `round < 5` ise `startRound` (yeni oda, `spawnPoints`, herkes canlı 100 can, statlar sıfır, `grantPoints`, `phase='skills'`), değilse `phase='matchEnd'`
  - `winners(s): string[]` (toplam puanı en yüksek olanlar; eşitlikte son turda daha iyi sıralanan, o da eşitse hepsi)

- [ ] **Step 1: Failing testler**

```ts
const cfg = { seed: 1, players: [{id:'A',name:'A',isBot:false},{id:'B',name:'B',isBot:true,difficulty:'easy'}] };
const s = startMatch(cfg);
expect(s.phase).toBe('skills'); expect(s.players.every(p=>p.unspent===5 && p.hp===100)).toBe(true);
expect(() => startMatch({ seed:1, players:[cfg.players[0]] })).toThrow();
allocateSkills(s,'A',{damage:5}); endSkills(s);
expect(s.phase).toBe('dark'); expect(s.players.find(p=>p.id==='B')!.unspent).toBe(0);
// tüm maçı otomatik oyna: plansız, sadece aim'ler birbirine; maç sonunda puanlar tutarlı
let guard = 0;
while (s.phase !== 'matchEnd' && guard++ < 10_000) {
  if (s.phase==='skills') endSkills(s);
  else if (s.phase==='dark') { for (const p of s.players) if (p.alive) submitPlan(s,p.id,{pos:p.pos, aim: aimAtOther(s,p)}); beginResolve(s); }
  else if (s.phase==='resolve') { runResolution(s.resolution!, s.room, s.players, s.rng); finishResolve(s); }
  else if (s.phase==='roundEnd') nextRound(s);
}
expect(s.phase).toBe('matchEnd'); expect(s.roundHistory).toHaveLength(5);
expect(s.players.reduce((t,p)=>t+p.score,0)).toBe(s.roundHistory.flatMap(Object.values).reduce((a,b)=>a+b,0));
// Review Focus 4: herkes 10/10 ise skills evresi atlanır
// (testte statları doldur, finishResolve sonrası phase 'dark' olmalı)
// determinizm: aynı seed + aynı girdiler → aynı final skorlar
```

- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): match state machine (rounds, moves, phases)`

---

### Task 9: Botlar

**Files:**
- Create: `packages/sim/src/bots.ts`; Modify: `index.ts`
- Test: `packages/sim/test/bots.test.ts`

**Interfaces:**
- Produces: `botAllocate(s: MatchState, id: string): Partial<Stats>` (kolay: rastgele; orta/zor: hasar+menzil+kalınlık ağırlıklı, 10 sınırına uyar, `unspent`'in tamamı), `botPlan(s: MatchState, id: string): { pos: Vec2; aim: number }` — botlar sadece insanların da bildiğini bilir: rakiplerin konumu olarak yalnızca `s.lastSeen` kullanılır (diğer botların bu hamledeki planı asla okunmaz).
  - kolay: rastgele geçerli hedef (≤ 5 m), rastgele nişan
  - orta: rastgele geçerli hedef; en yakın rakibin son bilinen konumuna nişan
  - zor: rakiplerin son konumundan uzaklaşan bir hedef; nişan = en yakın rakibin son konumu + `MOVE_SPEED·DARK_SECONDS·0.5` yarıçapında rastgele kaçış tahmini; isabetsizse ±0.15 rad gürültü
  - Her durumda `validatePlan(room, start, plan)` doğru olmalı.

- [ ] **Step 1: Failing testler** — 3 zorluk × 20 seed: `validatePlan` her zaman true; `botAllocate` toplamı `unspent`, hiçbir stat 10'u aşmaz; 200 maçlık simülasyonda `hard` botun `easy`'e karşı kazanma oranı > %60 (Task 8'deki otomatik döngü ile).
- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat(sim): bots with three difficulty levels`

---

### Task 10: İstemci iskeleti, menü, oda ve karakter render'ı

**Files:**
- Create: `apps/client/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/main.ts`, `src/ui/{strings.ts,menu.ts}`, `src/render/{scene.ts,roomView.ts,character.ts,hpBar.ts}`
- Test: `apps/client/test/character.test.ts`

**Interfaces:**
- Consumes: `@fitd/sim` (workspace bağımlılığı)
- Produces:
  - `menu.ts`: `showMenu(root: HTMLElement, onStart: (opts: { name: string; bots: number /*1..7*/; difficulty: Difficulty }) => void): void` — "Botlarla Oyna" + "Online (yakında)" (devre dışı); bot sayısı ve zorluk seçimi; ad `localStorage`'da hatırlanır (try/catch).
  - `scene.ts`: `createScene(canvas: HTMLCanvasElement): GameScene` — `{ renderer, scene, camera, setDark(dark: boolean), resize(), render() }`. Sim (x,y) → three (x, 0, y). Perspektif kamera ~55° eğik, odanın tamamı dikey ekrana sığar.
  - `roomView.ts`: `buildRoom(room: Room): THREE.Group` — sınır duvarları, duvar kutuları (1 m yükseklik), boru (metal silindir + iki ağız), bölgeler (renkli yer daireleri: büyütücü yeşil, küçültücü mavi, yön değiştirici turuncu ok). Her hamlede yeniden kurulur.
  - `character.ts`: `createCharacter(color: number): CharacterView` — kapsül gövde, küre kafa, kalın popo, ince kollar/bacaklar; yüz canvas dokusu (gözler + sırıtma). `CharacterView = { group; setPose(p: 'idle'|'bend'|'grin'|'dead', t: number); setFacing(rad); setHealth(hp: number) }`. Saf yardımcı: `faceColor(hp: number): string` → 100: ten `#f1c27d`, 50: yeşil `#7bd36b`, 0: mor `#8e44ad`, arası doğrusal karışım.
  - `hpBar.ts`: `createHpBar(): { sprite; set(hp: number) }` — bar + sayı, bar rengi yeşilden kırmızıya.
- `main.ts`: menü → `onStart` → şimdilik tek bir oda + 4 karakteri statik çizen sahne.

- [ ] **Step 1: Failing test** `faceColor(100)==='#f1c27d'`, `faceColor(50)==='#7bd36b'`, `faceColor(0)==='#8e44ad'`, `faceColor(150)` = `faceColor(100)`, `faceColor(-5)` = `faceColor(0)`.
- [ ] **Step 2: `npm -w apps/client test` → FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: `npm run dev`, yerleşik tarayıcıda mobil (375×812) ve masaüstü görünümde aç: menü görünüyor, başlatınca oda ve karakterler doğru ölçekte, konsolda hata yok.**
- [ ] **Step 6: Commit** `feat(client): vite+three scaffold, menu, room and character rendering`

---

### Task 11: Kontroller, karanlık evre, fener

**Files:**
- Create: `apps/client/src/input/{joystick.ts,controls.ts}`; Modify: `render/scene.ts`
- Test: `apps/client/test/joystick.test.ts`

**Interfaces:**
- Produces:
  - `joystick.ts`: saf `stickVector(origin: {x,y}, touch: {x,y}, maxRadius: number): { x: number; y: number }` (uzunluk ≤ 1, ölü bölge 0.1); `createJoystick(el: HTMLElement, side: 'left'|'right'): { value(): Vec2; active(): boolean; destroy() }` — her analog kendi `pointerId`'sini izler (Review Focus 5), ekranın sol/sağ yarısında dokunulan yerde belirir.
  - `controls.ts`: `createControls(canvas): { move(): Vec2; aim(): number | null; destroy() }` — dokunmatik analoglar + WASD/oklar + fare (fare imleci yönü, karakterden imlece). Ekran yönü sim yönüne kamera dönüşüyle çevrilir.
  - `scene.ts`: `setDark(true)` → ambiyans ~0, dış duvarlar soluk kenar çizgisiyle görünür, oyuncunun fenerinden `aim` yönünde `FLASHLIGHT_RANGE` (sim ölçeğinde) uzunluğunda SpotLight; rakip karakterler `visible=false`. Ekranda gaz yönünü gösteren kısa ok.
- Karanlık evrede karakter `stepMove` ile yürür (her karede `DT` biriktirerek sabit adım).

- [ ] **Step 1: Failing testler** `stickVector({x:0,y:0},{x:50,y:0},50)` → `{x:1,y:0}`; `{x:200,y:0}` → uzunluk 1; `{x:2,y:0}` → `{x:0,y:0}` (ölü bölge).
- [ ] **Step 2: FAIL** · **Step 3: Uygula** · **Step 4: PASS**
- [ ] **Step 5: Tarayıcıda mobil görünümde doğrula: sol analog yürütür, sağ analog oku ve feneri çevirir, ikisi aynı anda çalışır; duvar fenerle görünür, rakip görünmez; masaüstünde WASD + fare çalışır.**
- [ ] **Step 6: Commit** `feat(client): dual joystick + keyboard/mouse, dark phase with flashlight`

---

### Task 12: Yetenek ekranı

**Files:**
- Create: `apps/client/src/ui/skills.ts`; Modify: `ui/strings.ts`

**Interfaces:**
- Produces: `showSkills(root, opts: { stats: Stats; unspent: number; seconds: number; onConfirm: (alloc: Partial<Stats>) => void }): { close() }` — 6 satır (Kalınlık, Saçılma, Menzil, Hasar, Güç, Süre), her birinde mevcut seviye çubuğu (0–10), +/− butonları, kalan puan; puan bitmeden "Hazır" devre dışı; geri sayım; süre dolunca mevcut seçimle `onConfirm` (eksik kalanı sim `endSkills` otomatik dağıtır). Her özelliğin altında tek satır açıklama (spec §4.1 tablosu).

- [ ] **Step 1: Tarayıcıda doğrula: 5 puan dağıtılmadan "Hazır" basılamıyor; 10'u aşılamıyor; süre dolunca ekran kapanıyor; 375 px genişlikte taşma yok.**
- [ ] **Step 2: Commit** `feat(client): skill allocation screen`

---

### Task 13: Açılış, ağır çekim gaz, animasyonlar

**Files:**
- Create: `apps/client/src/render/gasView.ts`; Modify: `render/character.ts`, `render/scene.ts`

**Interfaces:**
- Produces: `createGasView(scene): { sync(res: Resolution): void; clear(): void }` — bulutlar yarı saydam, kabarık yeşil-sarı küre kümeleri (yarıçap = `cloud.radius`, ömrün sonuna doğru solar); partiküller küçük sprite'lar. Sahip rengine hafif ton.
- Açılış sırası: ışık yanar (0.4 sn) → rakipler görünür → herkes `bend` pozuna geçer (0.5 sn) → çözülme `SLOWMO = 0.35` hızında oynatılır (her kare `DT·SLOWMO` biriktirip `stepResolution`) → gazı biten `grin` → ölen `dead` (absürt devrilme) → `done` sonrası 1.5 sn bekleme.
- Her karede `setHealth(hp)` ile yüz rengi ve can barı güncellenir.

- [ ] **Step 1: Tarayıcıda doğrula: domalma → gaz popodan çıkıyor (karakterin yüzü gazın tersine bakıyor), ağır çekimde sekiyor/boruya girip çıkıyor, isabet alan karakterin yüzü yeşile/mora dönüyor ve can sayısı azalıyor, ölen devriliyor.**
- [ ] **Step 2: Commit** `feat(client): reveal, slow-motion gas, poses and poison face color`

---

### Task 14: Tam oyun döngüsü (bot modu), tur ve maç sonu ekranları

**Files:**
- Create: `apps/client/src/game/localGame.ts`, `apps/client/src/ui/hud.ts`; Modify: `main.ts`

**Interfaces:**
- Consumes: `startMatch`, `allocateSkills`, `endSkills`, `submitPlan`, `beginResolve`, `stepResolution`, `finishResolve`, `nextRound`, `winners`, `botAllocate`, `botPlan`
- Produces: `runLocalGame(root, opts: { name: string; bots: number; difficulty: Difficulty }): { destroy() }` — sim'i `startMatch({ seed: Date.now() ... })` ile kurar (seed tek yerde, istemcide), evreleri sürer: `skills` (insan: yetenek ekranı, botlar: `botAllocate`; herkes hazırsa erken geçiş) → `dark` (5 sn sayaç, insan yürür; bitince botlar `botPlan`, insan mevcut konum/nişan `submitPlan`) → açılış/çözülme (Task 13) → `finishResolve` → `roundEnd` (o turun sıralaması ve puanları, toplam tablo, "Sonraki tur") → `matchEnd` (kazanan, toplam puanlar, "Tekrar oyna" / "Menü").
- `hud.ts`: üstte "Tur X/5 · Hamle Y", evre sayacı, ölünce "İzleyici" etiketi; `showRoundEnd(...)`, `showMatchEnd(...)`.

- [ ] **Step 1: Tarayıcıda (mobil görünüm) 1 bota karşı ve 7 bota karşı birer maç baştan sona oyna: 5 tur tamamlanıyor, puanlar spec kuralına uyuyor, ölen oyuncu izlemeye devam ediyor, konsolda hata yok.**
- [ ] **Step 2: `npm test` (sim) → PASS; `npm -w apps/client run build` → hatasız.**
- [ ] **Step 3: Commit** `feat(client): full offline game loop with round and match end screens`

---

### Task 15: Web yayınına hazırlık

**Files:**
- Create: `README.md` (Türkçe: ne olduğu, `npm install`, `npm run dev`, `npm test`, yayın), `apps/client/public/_headers` (Cloudflare Pages: statik varlıklara uzun önbellek)
- Modify: `apps/client/vite.config.ts` (`base: '/'`)

- [ ] **Step 1: README'de Cloudflare Pages ayarlarını yaz: derleme komutu `npm install && npm -w apps/client run build`, çıktı klasörü `apps/client/dist`, özel alan adı `fartinthedark.dorukplays.com`. (Pages projesini bağlamak ve alan adını eklemek kullanıcının işi; dorukplays ana sayfa kartı ayrı repo.)**
- [ ] **Step 2: `npm -w apps/client run build && npx vite preview` ile derlenmiş sürümü yerleşik tarayıcıda aç, bir maç başlat.**
- [ ] **Step 3: Commit** `docs: README and Cloudflare Pages deploy setup`
