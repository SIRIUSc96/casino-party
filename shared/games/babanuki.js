// ババ抜き: 次の人の手札から1枚引き、同じ数字のペアを捨てる。最後までジョーカーを持っていた人が負け
import { stdDeck, shuffle, stdLabel, sortRank } from '../cards.js';
import { TURN_TIME, fail, ok } from './common.js';

export const meta = {
  id: 'babanuki', cat: 'card', name: 'ババ抜き', min: 2, max: 6,
  desc: '隣の人の手札から1枚ずつ引いて、同じ数字のペアを捨てていく。最後までジョーカーを持っていた人が負け',
  schema: [TURN_TIME],
};

export function create(n, _settings, { rng = Math.random } = {}) {
  const deck = shuffle([...stdDeck(0), { id: 'J1', suit: 'J', rank: 0 }], rng);
  let hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const discards = [];
  const finished = [];
  let loser = -1;

  const takePairs = (h) => {
    const by = {};
    for (const c of h) if (c.rank !== 0) (by[c.rank] ||= []).push(c);
    const pairs = [];
    for (const list of Object.values(by)) while (list.length >= 2) pairs.push([list.pop(), list.pop()]);
    const gone = new Set(pairs.flat().map((c) => c.id));
    return { pairs, rest: h.filter((c) => !gone.has(c.id)) };
  };
  hands = hands.map((h) => {
    const { pairs, rest } = takePairs(h);
    discards.push(...pairs);
    return rest;
  });
  for (let i = 0; i < n; i++) if (!hands[i].length) finished.push(i);

  const live = () => hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0);
  const next = (from) => {
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (hands[s].length) return s;
    }
    return from;
  };
  let start = Math.floor(rng() * n);
  while (!hands[start].length) start = (start + 1) % n;

  const e = {
    status: 'playing', pending: 0, turn: start,
    intro: ['ペアを捨てて開始！ 次の人の手札から1枚ずつ引いていきます'],
    hiddenIds: (seat) => hands.flatMap((h, i) => (i === seat ? [] : h.map((c) => c.id))),

    act(seat, a) {
      if (e.status !== 'playing') return fail('ゲームは終了しています');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      const t = next(seat);
      const i = Math.trunc(Number(a?.i));
      if (a?.t !== 'draw' || !(i >= 0 && i < hands[t].length)) return fail('引くカードを選んでください');
      const [c] = hands[t].splice(i, 1);
      shuffle(hands[t], rng); // 引かれた側の並びは毎回シャッフルして位置から推測できないようにする
      hands[seat].push(c);
      let line = `@${seat} が @${t} から1枚引いた`;
      if (c.rank !== 0) {
        const j = hands[seat].findIndex((x) => x !== c && x.rank === c.rank);
        if (j >= 0) {
          const m = hands[seat].splice(j, 1)[0];
          hands[seat].splice(hands[seat].indexOf(c), 1);
          discards.push([c, m]);
          line += ` → ペア成立 ${stdLabel(c)} ${stdLabel(m)}`;
        }
      }
      const logs = [line];
      if (!hands[t].length) { finished.push(t); logs.push(`@${t} あがり！`); }
      if (!hands[seat].length) { finished.push(seat); logs.push(`@${seat} あがり！`); }
      const lv = live();
      if (lv.length <= 1) {
        loser = lv[0] ?? -1;
        e.status = 'gameEnd';
        e.turn = -1;
        if (loser >= 0) logs.push(`@${loser} がババを持っていた… 負け！`);
      } else {
        e.turn = next(seat);
      }
      return ok(logs);
    },
    resolve: () => [],
    nextRound: () => [],
    cpu(seat) { return { t: 'draw', i: Math.floor(rng() * hands[next(seat)].length) }; },
    auto(seat) { return e.cpu(seat); },

    view(seat) {
      const g = {
        hand: seat >= 0 ? sortRank([...hands[seat]]) : [],
        counts: hands.map((h) => h.length),
        target: e.status === 'playing' ? next(e.turn) : -1,
        discards: discards.slice(-6),
        out: hands.map((_h, i) => finished.indexOf(i) + 1),
      };
      if (e.status === 'gameEnd') {
        const order = loser >= 0 ? [...finished, loser] : [...finished];
        g.result = {
          title: 'ババ抜き 結果', headers: ['順位', '名前', ''], final: true,
          rows: order.map((s, i) => ({ cells: [i + 1, '@' + s, s === loser ? 'ババ（負け）' : ''], me: s === seat, gold: i === 0 })),
        };
      }
      return g;
    },
  };
  return e;
}
