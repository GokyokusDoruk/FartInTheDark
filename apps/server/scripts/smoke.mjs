// End-to-end check against a running server (npm run dev:server):
// two players + one bot play a full match, B drops and reconnects mid-match,
// and a wrong room code is refused. Exit code 0 = OK.
const SERVER = process.env.SERVER ?? 'http://127.0.0.1:8787';
const WS = SERVER.replace(/^http/, 'ws');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT ?? 180_000);

const fail = msg => { console.error('SMOKE FAIL:', msg); process.exit(1); };
setTimeout(() => fail('timed out'), TIMEOUT_MS).unref();

const res = await fetch(`${SERVER}/api/rooms`, { method: 'POST' }).catch(e => fail(`create room: ${e.message}`));
if (!res.ok) fail(`create room: HTTP ${res.status}`);
const { code } = await res.json();
if (!/^[A-Z2-9]{5}$/.test(code)) fail(`bad code ${code}`);
console.log('room', code);

/** Spend every point (damage first), so the server never waits for the skills timeout. */
function spend(stats, points) {
  const alloc = {};
  for (const k of ['damage', 'range', 'thickness', 'power', 'duration', 'scatter']) {
    const n = Math.min(points, 10 - stats[k]);
    if (n > 0) { alloc[k] = n; points -= n; }
  }
  return alloc;
}

function client(name, { isHost = false, token, onDark } = {}) {
  return new Promise((resolveOpen) => {
    const c = { name, id: '', token: '', view: null, seen: new Set(), done: null, ws: null };
    c.finished = new Promise(r => { c.done = r; });
    const url = `${WS}/api/rooms/${code}/ws?name=${encodeURIComponent(name)}${token ? `&token=${token}` : ''}`;
    const ws = new WebSocket(url);
    c.ws = ws;
    const send = m => ws.readyState === 1 && ws.send(JSON.stringify(m));
    c.send = send;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.t === 'error') fail(`${name} got error ${m.code}`);
      if (m.t === 'welcome') { c.id = m.you; c.token = m.token; resolveOpen(c); return; }
      if (m.t !== 'view') return;
      const v = m.view;
      c.view = v;
      const key = `${v.round}:${v.moveSeq}:${v.phase}`;
      if (c.seen.has(key)) return;
      c.seen.add(key);
      if (v.phase === 'skills' && v.me?.alive && v.me.unspent > 0) send({ t: 'skills', alloc: spend(v.me.stats, v.me.unspent) });
      else if (v.phase === 'dark' && v.me?.alive) { if (!onDark?.(c, v)) send({ t: 'plan', pos: v.me.start, aim: v.me.aim + 1.1 }); }
      else if (v.phase === 'resolve') send({ t: 'replayDone', moveSeq: v.moveSeq });
      else if (v.phase === 'roundEnd' && v.hostId === c.id) send({ t: 'next' });
      else if (v.phase === 'matchEnd') c.done(v);
    };
    ws.onerror = () => fail(`${name} socket error`);
  });
}

// wrong code is refused with roomNotFound
await new Promise(r => {
  const ws = new WebSocket(`${WS}/api/rooms/ZZZZZ/ws?name=x`);
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.t === 'error' && m.code === 'roomNotFound') { console.log('wrong code refused'); r(); } else fail('wrong code not refused'); };
  ws.onerror = () => {};
});

let dropped = false;
let bRejoined = null;
let bBack = false;
// A holds its plan while B is away, so the dark phase is still running when B returns
const a = await client('Ayse', {
  isHost: true,
  onDark: (c, v) => {
    if (!dropped || bBack) return false;
    const wait = setInterval(() => {
      if (!bBack) return;
      clearInterval(wait);
      c.send({ t: 'plan', pos: v.me.start, aim: v.me.aim + 1.1 });
    }, 20);
    return true;
  },
});
const b = await client('Berk', {
  onDark: (c, v) => {
    if (dropped || v.round !== 2) return false;
    dropped = true;
    console.log('B drops in round 2 dark');
    c.ws.onmessage = null;
    c.ws.onerror = null;
    c.ws.close();
    setTimeout(async () => {
      bRejoined = await client('Berk', { token: c.token });
      if (bRejoined.id !== c.id) fail('reconnect gave a new seat');
      while (!bRejoined.view) await new Promise(r => setTimeout(r, 20));
      const first = bRejoined.view.phase;
      if (first !== 'dark') fail(`B came back into ${first}, expected the running dark phase`);
      if (!(bRejoined.view.remainingMs > 3000 && bRejoined.view.remainingMs < 5500)) fail(`remainingMs ${bRejoined.view.remainingMs}`);
      bBack = true;
      console.log('B back in round', bRejoined.view.round, 'phase', first);
    }, 1000);
    return true;
  },
});
a.send({ t: 'addBot', difficulty: 'hard' });
await new Promise(r => setTimeout(r, 200));
a.send({ t: 'start' });

const va = await a.finished;
while (!bRejoined) await new Promise(r => setTimeout(r, 100));
const vb = bRejoined.view?.phase === 'matchEnd' ? bRejoined.view : await bRejoined.finished;
const sa = JSON.stringify(va.players.map(p => [p.id, p.score]));
const sb = JSON.stringify(vb.players.map(p => [p.id, p.score]));
if (sa !== sb) fail(`scores differ ${sa} vs ${sb}`);
if (va.roundHistory.length !== 5) fail('not 5 rounds');
console.log('scores', sa);
console.log('OK');
process.exit(0);
