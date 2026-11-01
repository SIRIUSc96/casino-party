// 全ゲーム: サーバー経由で「ルーム作成 → ゲーム選択 → CPU追加 → 開始 → 最後まで進行」を確認する。
// 人間(ホスト)は開始直後に切断し、離席時の自動操作で進行する（タイマー・pending・ラウンド送りの確認も兼ねる）
import test from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { startServer } from '../server/index.js';
import { GAMES, GAME_IDS } from '../shared/games/index.js';

const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const waitFor = (fn, ms = 60000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const v = fn();
    if (v) { clearInterval(iv); res(v); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout')); }
  }, 20);
});

for (const id of GAME_IDS) {
  test(`${GAMES[id].meta.name}: サーバー経由で最後まで進む`, { timeout: 120000 }, async () => {
    const srv = await startServer({ port: 0, cpuDelay: 3, disconnectWait: 20, nextRoundWait: 40, pendingScale: 0.01 });
    const meta = GAMES[id].meta;
    const a = ioc(`http://localhost:${srv.port}`, { transports: ['websocket'], forceNew: true });
    a.view = null;
    a.on('state', (v) => { a.view = v; });
    await waitFor(() => a.connected);
    const { code } = await emit(a, 'create', { name: 'ホスト', token: 'tok-' + id });

    // ゲーム選択と、いちばん短くなる設定
    assert.ok((await emit(a, 'settings', { game: id })).ok);
    await waitFor(() => a.view?.game === id);
    const quick = {};
    for (const f of meta.schema) if (f.type === 'select') quick[f.k] = f.options[0][0];
    await emit(a, 'settings', { settings: quick });
    assert.equal((await emit(a, 'settings', { game: 'nonexistent' })).ok, false);

    // 人数が足りないと開始できない／CPUを足して開始
    const need = Math.max(meta.min, 2);
    if (meta.min > 1) assert.equal((await emit(a, 'start')).ok, false);
    while (a.view.seats.length < need) { a.emit('addCpu'); await waitFor(() => true); await new Promise((r) => setTimeout(r, 15)); }
    await waitFor(() => a.view.seats.length === need);
    assert.ok((await emit(a, 'start')).ok);
    await waitFor(() => a.view?.phase === 'playing' && a.view.g);
    assert.ok(a.view.g, 'viewにゲーム情報(g)がある');

    // ゲーム中の不正な操作は拒否される（落ちない）
    assert.equal((await emit(a, 'act', { a: { t: 'zzz' } })).ok, false);
    assert.equal((await emit(a, 'act', {})).ok, false);

    // 切断して、自動操作で最後まで進む
    a.close();
    const room = srv.rooms.get(code);
    await waitFor(() => room.phase === 'gameEnd', 90000);
    assert.ok(room.engine.view(0).result?.rows?.length, '結果が出る');
    await srv.close();
  });
}

test('ゲーム中に誰かが退出すると、ゲームは終わって残った人はロビーに戻る', { timeout: 20000 }, async () => {
  const srv = await startServer({ port: 0, cpuDelay: 3000, disconnectWait: 60000, nextRoundWait: 60000 });
  const mk = async (name) => {
    const s = ioc(`http://localhost:${srv.port}`, { transports: ['websocket'], forceNew: true });
    s.view = null;
    s.on('state', (v) => { s.view = v; });
    await waitFor(() => s.connected);
    return s;
  };
  const a = await mk(), b = await mk();
  const { code } = await emit(a, 'create', { name: 'ホスト', token: 'leave-a' });
  await emit(b, 'join', { code, name: 'ゲスト', token: 'leave-b' });
  assert.ok((await emit(a, 'settings', { game: 'babanuki' })).ok);
  assert.ok((await emit(a, 'start')).ok);
  await waitFor(() => b.view?.phase === 'playing');
  b.emit('leave');
  await waitFor(() => a.view?.phase === 'lobby');
  assert.equal(a.view.seats.length, 1);
  assert.ok(a.view.log.some((l) => l.includes('ゲームを終了')));
  // 最後の1人が退出すればルームは消える
  a.emit('leave');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await emit(b, 'rejoin', { code, token: 'leave-b' })).ok, false);
  a.close(); b.close(); await srv.close();
});
