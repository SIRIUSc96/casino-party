// オンライン大富豪 サーバー（Express + Socket.IO）
// サーバー権威型: ゲーム状態はすべてここで持ち、クライアントには「自分の手札」だけを送る
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { GAMES, defaultsOf, sanitizeSettings } from '../shared/games/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_GAME = 'daifugo';
const CPU_NAMES = ['CPUアカギ', 'CPUミドリ', 'CPUアオイ', 'CPUキイロ', 'CPUモモ'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function startServer({ port = process.env.PORT || 3000, cpuDelay = 1100, disconnectWait = 15000, nextRoundWait = 20000, pendingScale = 1 } = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

  app.use('/shared', express.static(path.join(__dirname, '../shared')));
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('/healthz', (_req, res) => res.send('ok'));

  const rooms = new Map();

  const newCode = () => {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!rooms.has(c)) return c;
    }
  };
  const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>@]/g, '').trim().slice(0, 10) || 'ななし';

  function createRoom(hostName, token) {
    const room = {
      code: newCode(),
      phase: 'lobby', // lobby | playing | roundEnd | gameEnd
      gameId: DEFAULT_GAME, settings: defaultsOf(GAMES[DEFAULT_GAME].meta),
      seats: [{ token, name: hostName, cpu: false, sid: null, connected: false }],
      hostToken: token,
      engine: null, log: [], timer: null, deadline: 0, lastActive: Date.now(), removeTimers: new Map(),
    };
    rooms.set(room.code, room);
    return room;
  }

  const seatOfToken = (room, token) => room.seats.findIndex((s) => !s.cpu && s.token === token);
  const hostSeat = (room) => seatOfToken(room, room.hostToken);

  function pushLog(room, text) {
    room.logN = (room.logN || 0) + 1;
    room.log.push(String(text).replace(/@(\d)/g, (_m, i) => room.seats[Number(i)]?.name ?? ''));
    if (room.log.length > 30) room.log.shift();
  }

  // ---- クライアントへ送る状態（その席に見えてよい情報だけ）----
  function viewFor(room, seat) {
    const e = room.engine;
    const v = {
      code: room.code, phase: room.phase, game: room.gameId, settings: room.settings, you: seat,
      hostSeat: hostSeat(room), log: room.log.slice(-8), logN: room.logN || 0, deadline: room.deadline,
      seats: room.seats.map((s) => ({ name: s.name, cpu: s.cpu, connected: s.cpu ? true : s.connected })),
    };
    if (e && room.phase !== 'lobby') { v.turn = e.turn; v.g = e.view(seat); }
    return v;
  }

  function broadcast(room) {
    room.lastActive = Date.now();
    room.seats.forEach((s, i) => {
      if (!s.cpu && s.sid) io.to(s.sid).emit('state', viewFor(room, i));
    });
  }

  // ---- 進行管理 ----
  function clearTimer(room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = 0;
  }

  const pendMs = (e) => Math.max(1, Math.round(e.pending * pendingScale));
  // いま操作待ちなのが seat か（pending中は待ち時間なので除く）
  const waitingOn = (room, seat) => room.phase === 'playing' && room.engine && !room.engine.pending && room.engine.turn === seat;

  function scheduleTurn(room) {
    const e = room.engine;
    // 同じ待ち時間（ベット受付など）の途中で操作があっても、タイマーを延長しない
    if (e && e.pending && e.pendingSeq !== undefined && room.pendKey === e.pendingSeq && room.timer) return;
    clearTimer(room);
    room.pendKey = e && e.pending ? e.pendingSeq : undefined;
    if (room.phase !== 'playing' || !e) return;
    if (e.pending) {
      if (e.pendingVisible) room.deadline = Date.now() + pendMs(e);
      room.timer = setTimeout(() => resolvePending(room), pendMs(e));
      return;
    }
    const seat = e.turn;
    if (seat < 0) return;
    const s = room.seats[seat];
    const turnTime = Number(room.settings.turnTime) || 0;
    if (s.cpu) {
      room.timer = setTimeout(() => cpuMove(room, seat), cpuDelay + Math.random() * 500);
    } else if (!s.connected) {
      room.deadline = Date.now() + disconnectWait;
      room.timer = setTimeout(() => autoMove(room, seat), disconnectWait);
    } else if (turnTime > 0) {
      room.deadline = Date.now() + turnTime * 1000;
      room.timer = setTimeout(() => autoMove(room, seat), turnTime * 1000);
    }
  }

  // 操作の結果を反映: ログ追加 → 状態の同期 → 次の予約 → 配信
  function afterAction(room, logs) {
    for (const l of logs || []) pushLog(room, l);
    const e = room.engine;
    room.phase = e.status;
    if (e.status === 'playing') {
      scheduleTurn(room);
    } else if (e.status === 'roundEnd') {
      clearTimer(room);
      const w = e.roundWait ? Math.min(nextRoundWait, e.roundWait) : nextRoundWait;
      room.deadline = Date.now() + w;
      room.timer = setTimeout(() => startNextRound(room), w);
    } else {
      clearTimer(room);
    }
    broadcast(room);
  }

  function resolvePending(room) {
    const e = room.engine;
    if (room.phase !== 'playing' || !e || !e.pending) return;
    afterAction(room, e.resolve());
  }

  function startNextRound(room) {
    if (room.phase !== 'roundEnd') return;
    clearTimer(room);
    afterAction(room, room.engine.nextRound());
  }

  function safeAct(e, seat, action) {
    try { return e.act(seat, action); } catch (err) { return { ok: false, error: '不正な操作です' }; }
  }

  function cpuMove(room, seat) {
    const e = room.engine;
    if (room.phase !== 'playing' || !e || e.pending || e.turn !== seat) return;
    let r = safeAct(e, seat, e.cpu(seat));
    if (!r.ok) r = safeAct(e, seat, e.auto(seat));
    if (!r.ok) { console.error('CPUが動けません', room.gameId, r.error); return; }
    afterAction(room, r.logs);
  }

  function autoMove(room, seat) {
    const e = room.engine;
    if (room.phase !== 'playing' || !e || e.pending || e.turn !== seat) return;
    const r = safeAct(e, seat, e.auto(seat));
    if (!r.ok) return;
    afterAction(room, [`@${seat}: 時間切れで自動操作`, ...r.logs]);
  }

  function convertToCpu(room, seat) {
    const s = room.seats[seat];
    s.cpu = true;
    s.sid = null;
    s.connected = true;
    s.token = 'cpu-' + Math.random().toString(36).slice(2);
    s.name = 'CPU(' + s.name + ')';
  }

  // ---- ロビー操作 ----
  function removeSeatInLobby(room, seat) {
    const was = room.seats[seat];
    room.seats.splice(seat, 1);
    if (was.token === room.hostToken) {
      const nh = room.seats.find((s) => !s.cpu);
      if (nh) room.hostToken = nh.token;
    }
    if (!room.seats.some((s) => !s.cpu)) rooms.delete(room.code);
  }

  io.on('connection', (socket) => {
    const ctx = () => {
      const room = rooms.get(socket.data.code);
      if (!room) return {};
      const seat = seatOfToken(room, socket.data.token);
      return { room, seat };
    };
    const attach = (room, seat, token) => {
      const s = room.seats[seat];
      if (s.sid && s.sid !== socket.id) io.to(s.sid).emit('kicked', { reason: '別の画面で参加しました' });
      s.sid = socket.id;
      s.connected = true;
      socket.data.code = room.code;
      socket.data.token = token;
      socket.join(room.code);
      const t = room.removeTimers.get(token);
      if (t) { clearTimeout(t); room.removeTimers.delete(token); }
      if (waitingOn(room, seat)) scheduleTurn(room);
      broadcast(room);
    };

    socket.on('create', (p, cb) => {
      const token = String(p?.token || '').slice(0, 64);
      if (!token) return cb?.({ ok: false, error: '不正なリクエストです' });
      const room = createRoom(cleanName(p?.name), token);
      attach(room, 0, token);
      cb?.({ ok: true, code: room.code });
    });

    socket.on('join', (p, cb) => {
      const code = String(p?.code || '').toUpperCase().trim();
      const token = String(p?.token || '').slice(0, 64);
      const room = rooms.get(code);
      if (!room || !token) return cb?.({ ok: false, error: 'ルームが見つかりません' });
      const existing = seatOfToken(room, token);
      if (existing >= 0) {
        if (p?.name) room.seats[existing].name = cleanName(p.name);
        attach(room, existing, token);
        return cb?.({ ok: true, code });
      }
      if (room.phase !== 'lobby') return cb?.({ ok: false, error: 'ゲームはすでに始まっています' });
      if (room.seats.length >= GAMES[room.gameId].meta.max) return cb?.({ ok: false, error: 'ルームが満員です' });
      room.seats.push({ token, name: cleanName(p?.name), cpu: false, sid: null, connected: false });
      attach(room, room.seats.length - 1, token);
      pushLog(room, `${room.seats.at(-1).name}が入室しました`);
      broadcast(room);
      cb?.({ ok: true, code });
    });

    // 再接続（リロード・回線切れ後）。名前の指定は不要
    socket.on('rejoin', (p, cb) => {
      const code = String(p?.code || '').toUpperCase().trim();
      const token = String(p?.token || '').slice(0, 64);
      const room = rooms.get(code);
      const seat = room ? seatOfToken(room, token) : -1;
      if (!room || seat < 0) return cb?.({ ok: false, error: 'ルームに戻れませんでした' });
      attach(room, seat, token);
      cb?.({ ok: true, code });
    });

    socket.on('settings', (p, cb) => {
      const { room, seat } = ctx();
      if (!room || room.phase !== 'lobby' || seat !== hostSeat(room)) return cb?.({ ok: false, error: 'ホストのみ変更できます' });
      if (p?.game && p.game !== room.gameId) {
        const G = GAMES[p.game];
        if (!G) return cb?.({ ok: false, error: '不明なゲームです' });
        if (room.seats.length > G.meta.max) return cb?.({ ok: false, error: `${G.meta.name}は最大${G.meta.max}人です。参加者を減らしてください` });
        room.gameId = p.game;
        room.settings = defaultsOf(G.meta);
      } else if (p?.settings && typeof p.settings === 'object') {
        room.settings = sanitizeSettings(GAMES[room.gameId].meta, { ...room.settings, ...p.settings });
      }
      broadcast(room);
      cb?.({ ok: true });
    });

    socket.on('addCpu', () => {
      const { room, seat } = ctx();
      if (!room || room.phase !== 'lobby' || seat !== hostSeat(room)) return;
      if (room.seats.length >= GAMES[room.gameId].meta.max) return;
      const used = new Set(room.seats.map((s) => s.name));
      const name = CPU_NAMES.find((n) => !used.has(n)) || 'CPU' + room.seats.length;
      room.seats.push({ token: 'cpu-' + Math.random().toString(36).slice(2), name, cpu: true, sid: null, connected: true });
      broadcast(room);
    });

    socket.on('kick', (p) => {
      const { room, seat } = ctx();
      if (!room || room.phase !== 'lobby' || seat !== hostSeat(room)) return;
      const i = Math.trunc(Number(p?.seat));
      if (!(i >= 0 && i < room.seats.length) || i === seat) return;
      const t = room.seats[i];
      if (t.sid) io.to(t.sid).emit('kicked', { reason: 'ホストに退出させられました' });
      room.seats.splice(i, 1);
      broadcast(room);
    });

    socket.on('start', (_p, cb) => {
      const { room, seat } = ctx();
      if (!room || seat !== hostSeat(room)) return cb?.({ ok: false, error: 'ホストのみ開始できます' });
      if (room.phase !== 'lobby') return cb?.({ ok: false, error: 'すでに開始しています' });
      const G = GAMES[room.gameId];
      if (room.seats.length < G.meta.min) return cb?.({ ok: false, error: `${G.meta.min}人以上必要です（CPUも追加できます）` });
      room.engine = G.create(room.seats.length, room.settings, { isCpu: (i) => !!room.seats[i]?.cpu });
      room.log = [];
      pushLog(room, `${G.meta.name} 開始！`);
      afterAction(room, room.engine.intro);
      cb?.({ ok: true });
    });

    // すべてのゲーム共通の操作窓口。中身（action）はゲームごとに違う
    socket.on('act', (p, cb) => {
      const { room, seat } = ctx();
      if (!room || seat < 0 || room.phase !== 'playing') return cb?.({ ok: false, error: '今は操作できません' });
      const r = safeAct(room.engine, seat, p?.a ?? {});
      if (!r.ok) return cb?.({ ok: false, error: r.error });
      afterAction(room, r.logs);
      cb?.({ ok: true });
    });

    socket.on('nextRound', () => {
      const { room, seat } = ctx();
      if (!room || seat !== hostSeat(room)) return;
      startNextRound(room);
    });

    socket.on('toLobby', () => {
      const { room, seat } = ctx();
      if (!room || seat !== hostSeat(room) || room.phase !== 'gameEnd') return;
      room.phase = 'lobby';
      room.engine = null;
      room.seats = room.seats.filter((s) => s.cpu || s.connected);
      pushLog(room, 'ロビーに戻りました');
      broadcast(room);
    });

    socket.on('leave', () => {
      const { room, seat } = ctx();
      if (!room || seat < 0) return;
      socket.leave(room.code);
      socket.data.code = null;
      if (room.phase === 'lobby') {
        pushLog(room, `${room.seats[seat].name}が退室しました`);
        removeSeatInLobby(room, seat);
      } else {
        // 誰かが退出したらゲームを中断して、残った人はロビーへ戻る（CPUが引き継いで続行はしない）
        const name = room.seats[seat].name;
        clearTimer(room);
        room.phase = 'lobby';
        room.engine = null;
        removeSeatInLobby(room, seat);
        room.seats = room.seats.filter((x) => x.cpu || x.connected);
        if (rooms.has(room.code)) pushLog(room, `${name}が退出したため、ゲームを終了しました`);
      }
      if (rooms.has(room.code)) broadcast(room);
    });

    socket.on('disconnect', () => {
      const { room, seat } = ctx();
      if (!room || seat < 0) return;
      const s = room.seats[seat];
      if (s.sid !== socket.id) return;
      s.connected = false;
      s.sid = null;
      if (room.phase === 'lobby') {
        // 少し待っても戻らなければロビーから外す
        const token = s.token;
        const t = setTimeout(() => {
          room.removeTimers.delete(token);
          const i = seatOfToken(room, token);
          if (i >= 0 && !room.seats[i].connected && room.phase === 'lobby') {
            removeSeatInLobby(room, i);
            if (rooms.has(room.code)) broadcast(room);
          }
        }, 30000);
        room.removeTimers.set(token, t);
      } else if (waitingOn(room, seat)) {
        scheduleTurn(room);
      }
      broadcast(room);
    });
  });

  // 放置ルームの掃除（全員切断から30分）
  const sweep = setInterval(() => {
    for (const [code, room] of rooms) {
      const anyone = room.seats.some((s) => !s.cpu && s.connected);
      if (!anyone && Date.now() - room.lastActive > 30 * 60 * 1000) {
        clearTimer(room);
        rooms.delete(code);
      }
    }
  }, 60 * 1000);
  sweep.unref();

  return new Promise((resolve) => {
    server.listen(port, () => {
      const actual = server.address().port;
      resolve({
        port: actual, io, server, rooms,
        close: () => new Promise((res) => {
          clearInterval(sweep);
          for (const room of rooms.values()) { clearTimer(room); room.removeTimers.forEach((t) => clearTimeout(t)); }
          io.close(() => res());
        }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().then(({ port }) => console.log(`大富豪サーバー起動: http://localhost:${port}`));
}
