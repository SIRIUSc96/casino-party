// 全ゲーム共通: CPU同士の自動対戦。必ず終わる／CPUが不正な手を出さない／他人に見せてはいけないカードがviewに漏れない
import { GAMES, GAME_IDS, sanitizeSettings } from '../shared/games/index.js';

let seed = 2468;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rnd = (n) => Math.floor(rng() * n);

function randomSettings(meta) {
  const raw = {};
  for (const f of meta.schema) raw[f.k] = f.type === 'bool' ? rng() < 0.6 : f.options[rnd(f.options.length)][0];
  raw.turnTime = 0;
  return sanitizeSettings(meta, raw);
}

const stats = {};
for (const id of GAME_IDS) {
  const { meta, create } = GAMES[id];
  const st = (stats[id] = { games: 0, steps: 0, rounds: 0 });
  for (let n = meta.min; n <= meta.max; n++) {
    for (let g = 0; g < (id === 'blackjack' ? 20 : 40); g++) {
      const settings = randomSettings(meta);
      const isCpu = () => true;
      const e = create(n, settings, { rng, isCpu });
      let guard = 0;
      const check = () => {
        for (let s = 0; s < n; s++) {
          const json = JSON.stringify(e.view(s));
          for (const hid of e.hiddenIds(s)) {
            if (json.includes(`"id":"${hid}"`)) throw new Error(`${id}: 席${s}のviewに見せてはいけないカード ${hid} が含まれている`);
          }
        }
      };
      check();
      while (e.status !== 'gameEnd') {
        if (++guard > 20000) throw new Error(`${id}: 進行が終わらない n=${n} ${JSON.stringify(settings)}`);
        if (e.status === 'roundEnd') { e.nextRound(); st.rounds++; check(); continue; }
        if (e.pending) { e.resolve(); }
        else {
          const seat = e.turn;
          if (!(seat >= 0 && seat < n)) throw new Error(`${id}: 手番が不正 ${seat}`);
          const a = e.cpu(seat);
          let r = e.act(seat, a);
          if (!r.ok) throw new Error(`${id}: CPUが不正な手 ${JSON.stringify(a)} → ${r.error}`);
          if (!Array.isArray(r.logs)) throw new Error(`${id}: logsがない`);
          // 時間切れ用の手も有効であること（状態は変えないよう、次の手番で確認）
        }
        st.steps++;
        if (guard % 7 === 0) check();
      }
      const res = e.view(0).result;
      if (!res || !res.rows.length) throw new Error(`${id}: 結果が出ない`);
      check();
      st.games++;
    }
  }
}

// 時間切れ/離席用 auto が常に有効な手を返すこと
for (const id of GAME_IDS) {
  const { meta, create } = GAMES[id];
  for (let t = 0; t < 30; t++) {
    const n = meta.min + rnd(meta.max - meta.min + 1);
    const e = create(n, randomSettings(meta), { rng, isCpu: () => true });
    let guard = 0;
    while (e.status !== 'gameEnd' && ++guard < 20000) {
      if (e.status === 'roundEnd') { e.nextRound(); continue; }
      if (e.pending) { e.resolve(); continue; }
      const seat = e.turn;
      const r = e.act(seat, e.auto(seat));
      if (!r.ok) throw new Error(`${id}: autoが不正な手 → ${r.error}`);
    }
    if (e.status !== 'gameEnd') throw new Error(`${id}: autoだけだと終わらない`);
  }
}

console.log('OK', JSON.stringify(stats));
