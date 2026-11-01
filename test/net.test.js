// 通信の通しテスト: 3人の人間(Socket.IOクライアント)+CPU2人で1ゲームを最後まで遊ぶ
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';
import * as R from '../shared/rules.js';

const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));

function client(port, token) {
  const s = ioc(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true });
  s.view = null;
  s.on('state', (v) => { s.view = v; s.emit('__tick'); });
  s.token = token;
  return s;
}

const waitFor = (fn, ms = 20000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const v = fn();
    if (v) { clearInterval(iv); res(v); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
  }, 20);
});

// 手札から出せる手を選ぶ（クライアントと同じ共有ルールで判定）
function decide(v) {
  const g = v.g;
  const r = { field: g.field, lock: g.lock, rev: g.rev, back: g.back, rules: g.rules, hands: [], n: v.seats.length };
  r.hands[v.you] = g.hand;
  const ctx = R.ctxOf(r);
  // 単体〜同数字の組を試す
  const hand = g.hand;
  const tries = [];
  for (const c of hand) tries.push([c]);
  for (const a of hand) for (const b of hand) if (a.id < b.id && a.rank === b.rank) tries.push([a, b]);
  const ok = tries.filter((cs) => R.checkPlay(ctx, cs).ok);
  ok.sort((x, y) => R.strength(x[0].rank, g.rev !== g.back) - R.strength(y[0].rank, g.rev !== g.back));
  return ok.length ? { ids: ok[0].map((c) => c.id) } : { pass: true };
}

test('3人+CPU2人でゲームを最後まで通しで遊べる（通信）', { timeout: 120000 }, async () => {
  const srv = await startServer({ port: 0, cpuDelay: 5, disconnectWait: 200, nextRoundWait: 300, pendingScale: 0.01 });
  const port = srv.port;
  const a = client(port, 'tok-a');
  const b = client(port, 'tok-b');
  const c = client(port, 'tok-c');
  await waitFor(() => a.connected && b.connected && c.connected);

  const created = await emit(a, 'create', { name: 'アリス', token: 'tok-a' });
  assert.ok(created.ok);
  const code = created.code;
  assert.match(code, /^[A-Z2-9]{4}$/);

  assert.equal((await emit(b, 'join', { code: 'ZZZZ', name: 'x', token: 'tok-b' })).ok, false);
  assert.ok((await emit(b, 'join', { code, name: 'ボブ', token: 'tok-b' })).ok);
  assert.ok((await emit(c, 'join', { code: code.toLowerCase(), name: 'チャーリー', token: 'tok-c' })).ok);

  // ホスト以外は設定変更・開始できない
    assert.equal((await emit(b, 'start')).ok, false);
  a.emit('settings', { settings: { rounds: 3, eight: true, jokers: 1 } });
  await waitFor(() => a.view?.settings.rounds === 3 && a.view.settings.jokers === 1);
  b.emit('settings', { settings: { rounds: 10 } }); // ホスト以外は変更できない
  a.emit('addCpu');
  a.emit('addCpu');
  await waitFor(() => a.view.seats.length === 5);
  const full = client(port, 'tok-d');
  await waitFor(() => full.connected);
  assert.equal((await emit(full, 'join', { code, name: 'あふれ', token: 'tok-d' })).ok, false);
  full.close();

  assert.ok((await emit(a, 'start')).ok);
  await waitFor(() => a.view?.phase === 'playing');

  // 他人の手札は見えない（自分の手札のみ）
  assert.ok(a.view.g.hand.length > 0);
  for (const c of b.view.g.hand) assert.equal(JSON.stringify(a.view).includes('"id":"' + c.id + '"'), false, '他人の手札がviewに含まれている');
  assert.ok(!('hands' in a.view) && !('hands' in a.view.g));
  assert.equal(a.view.settings.rounds, 3);

  // 手番でない人の操作は拒否される
  const notTurn = [a, b, c].find((s) => s.view.you !== s.view.turn && s.view.seats[s.view.turn] && !s.view.seats[s.view.turn].cpu === false);
  let rejected = 0;
  for (const s of [a, b, c]) {
    if (s.view.turn !== s.view.you) {
      const res = await emit(s, 'act', { a: { t: 'play', ids: [s.view.g.hand[0].id] } });
      assert.equal(res.ok, false);
      rejected++;
    }
  }
  assert.ok(rejected >= 1);
  assert.equal((await emit(a, 'act', { a: null })).ok, false);
  assert.equal((await emit(a, 'act', { a: { t: 'play', ids: 'x' } })).ok, false);

  // 人間側は自動で操作するボットとして動かす
  const bots = [a, b, c];
  let moves = 0;
  const runner = setInterval(async () => {
    for (const s of bots) {
      const v = s.view;
      if (v?.phase === 'playing' && v.turn === v.you && !s.busy) {
        s.busy = true;
        const d = decide(v);
        const res = d.pass ? await emit(s, 'act', { a: { t: 'pass' } }) : await emit(s, 'act', { a: { t: 'play', ids: d.ids } });
        if (!res.ok) { s.lastErr = res.error; }
        else moves++;
        s.busy = false;
      }
    }
  }, 10);

  // 途中でボブが切断 → 再接続して席に戻れる
  await waitFor(() => a.view.log.length > 3);
  const bView = b.view;
  b.close();
  await new Promise((r) => setTimeout(r, 300));
  const b2 = client(port, 'tok-b');
  await waitFor(() => b2.connected);
  const rj = await emit(b2, 'rejoin', { code, token: 'tok-b' });
  assert.ok(rj.ok);
  await waitFor(() => b2.view?.you === bView.you);
  bots[1] = b2;

  await waitFor(() => a.view.phase === 'gameEnd', 90000);
  clearInterval(runner);
  for (const s of bots) assert.equal(s.lastErr, undefined, 'ボットの操作がサーバーに拒否された: ' + s.lastErr);
  assert.equal(a.view.g.result.rows.length, 5);
  assert.equal(a.view.g.result.final, true);
  assert.ok(moves > 20);

  // ホストがロビーに戻せる
  a.emit('toLobby');
  await waitFor(() => a.view.phase === 'lobby');

  [a, b2, c].forEach((s) => s.close());
  await srv.close();
});
