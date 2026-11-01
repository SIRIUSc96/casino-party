// ダウト: A→2→3…の順に、その数字だと言って伏せて出す。嘘だと思ったら「ダウト！」。手札を先になくした人が勝ち
import { stdDeck, shuffle, stdLabel, sortRank, rankLabel } from '../cards.js';
import { TURN_TIME, fail, ok } from './common.js';

export const meta = {
  id: 'doubt', cat: 'card', name: 'ダウト', min: 3, max: 6,
  desc: 'A→2→3…の順に「その数字」と言って伏せて出す。嘘だと思ったら「ダウト！」。外すと場の山を全部引き取り。最初に手札を出し切った人の勝ち',
  schema: [
    { k: 'handSize', type: 'select', label: '配る枚数', def: 8, options: [[5, '1人5枚（短め）'], [8, '1人8枚'], [12, '1人12枚'], [0, '全部配る（長め）']] },
    { k: 'callTime', type: 'select', label: 'ダウト判断の時間', def: 5, options: [[3, '3秒'], [5, '5秒'], [8, '8秒']] },
    TURN_TIME,
  ],
};

export function create(n, settings, { rng = Math.random, isCpu = () => false } = {}) {
  const callMs = (Number(settings.callTime) || 5) * 1000;
  const hands = Array.from({ length: n }, () => []);
  const each = Number(settings.handSize) || 0; // 0 = 全部配る
  const deal = shuffle(stdDeck(0), rng);
  (each ? deal.slice(0, each * n) : deal).forEach((c, i) => hands[i % n].push(c));
  hands.forEach(sortRank);
  let pile = [], last = null, reveal = null, win = false, required = 1;
  const finished = [];

  const live = () => hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0);
  const nextLive = (from) => {
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (hands[s].length) return s;
    }
    return from;
  };

  const e = {
    status: 'playing', pending: 0, pendingVisible: false, turn: Math.floor(rng() * n),
    intro: ['A から順番に出していきます。嘘だと思ったら「ダウト！」'],
    hiddenIds: (seat) => {
      const shown = new Set((reveal?.cards || []).map((c) => c.id));
      return hands.flatMap((h, i) => (i === seat ? [] : h.map((c) => c.id))).filter((id) => !shown.has(id)).concat(pile.map((c) => c.id));
    },
  };

  function afterPlay(logs) {
    const p = last.seat;
    if (!hands[p].length && !finished.includes(p)) { finished.push(p); logs.push(`@${p} あがり！ 勝利！`); }
    required = (required % 13) + 1;
    if (finished.length) { e.status = 'gameEnd'; e.turn = -1; }
    else e.turn = nextLive(p);
    return logs;
  }

  function settle(caller) {
    const liar = last.cards.some((c) => c.rank !== last.rank);
    const loserSeat = liar ? last.seat : caller;
    const taken = pile.length;
    hands[loserSeat].push(...pile);
    sortRank(hands[loserSeat]);
    pile = [];
    reveal = { cards: last.cards, rank: last.rank, liar, caller, from: last.seat, loser: loserSeat };
    win = false; e.pending = 0; e.pendingVisible = false;
    return afterPlay([`@${caller}: ダウト！ ${last.cards.map(stdLabel).join(' ')} → ${liar ? '嘘でした！' : '本当でした…'} @${loserSeat} が${taken}枚を引き取り`]);
  }

  function cpuDoubts(s) {
    const mine = hands[s].filter((c) => c.rank === last.rank).length;
    if (last.count + mine > 4) return true; // 4枚しかない数字なので確実に嘘
    let p = 0.08 + 0.06 * last.count;
    if (hands[last.seat].length <= 2) p += 0.35; // 上がりそうな人は止めたい
    return rng() < Math.min(p, 0.85);
  }

  function truthful(seat) {
    const match = hands[seat].filter((c) => c.rank === required);
    return match.length ? { t: 'play', ids: match.map((c) => c.id) } : null;
  }
  function lie(seat, k) {
    const pool = shuffle([...hands[seat]], rng);
    return { t: 'play', ids: pool.slice(0, Math.min(k, pool.length)).map((c) => c.id) };
  }

  Object.assign(e, {
    act(seat, a) {
      if (e.status !== 'playing') return fail('ゲームは終了しています');
      if (a?.t === 'doubt') {
        if (!win) return fail('いまはダウトできません');
        if (seat === last.seat) return fail('自分の出したカードにはダウトできません');
        if (!hands[seat].length) return fail('あがった人はダウトできません');
        return ok(settle(seat));
      }
      if (a?.t !== 'play') return fail('不正な操作です');
      if (win) return fail('ダウト判断の時間中です');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      const ids = a.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 4 || new Set(ids).size !== ids.length) return fail('1〜4枚選んでください');
      const cards = ids.map((id) => hands[seat].find((c) => c.id === id));
      if (cards.some((c) => !c)) return fail('手札にないカードです');
      hands[seat] = hands[seat].filter((c) => !ids.includes(c.id));
      pile.push(...cards);
      last = { seat, cards, rank: required, count: cards.length };
      reveal = null; win = true; e.turn = -1; e.pending = callMs; e.pendingVisible = true;
      return ok([`@${seat} が ${rankLabel(required)} を ${cards.length}枚 出しました`]);
    },
    resolve() {
      if (!win) { e.pending = 0; return []; }
      for (let k = 1; k < n; k++) {
        const s = (last.seat + k) % n;
        if (hands[s].length && isCpu(s) && cpuDoubts(s)) return settle(s);
      }
      win = false; e.pending = 0; e.pendingVisible = false;
      return afterPlay([]);
    },
    nextRound: () => [],
    cpu(seat) {
      const match = hands[seat].filter((c) => c.rank === required);
      if (match.length && match.length === hands[seat].length) return truthful(seat); // 全部出せるなら上がり
      if (match.length) {
        if (rng() < 0.75) return truthful(seat);
        return { t: 'play', ids: [...match.map((c) => c.id), ...lie(seat, 1).ids.filter((id) => !match.some((c) => c.id === id))].slice(0, 4) };
      }
      return lie(seat, rng() < 0.75 ? 1 : 2);
    },
    auto(seat) { return truthful(seat) || lie(seat, 1); },

    view(seat) {
      const g = {
        hand: seat >= 0 ? hands[seat] : [], counts: hands.map((h) => h.length), required, pileCount: pile.length,
        window: win, last: last ? { seat: last.seat, count: last.count, rank: last.rank } : null, reveal,
        out: hands.map((_h, i) => finished.indexOf(i) + 1),
        canDoubt: win && seat >= 0 && seat !== last.seat && hands[seat].length > 0,
      };
      if (e.status === 'gameEnd') {
        const order = hands.map((h, s) => ({ s, k: h.length })).sort((a, b) => a.k - b.k);
        g.result = {
          title: 'ダウト 結果', headers: ['順位', '名前', '残り'], final: true,
          rows: order.map((o) => ({ cells: [1 + hands.filter((h) => h.length < o.k).length, '@' + o.s, o.k ? `${o.k}枚` : 'あがり'], me: o.s === seat, gold: o.k === 0 })),
        };
      }
      return g;
    },
  });
  return e;
}
