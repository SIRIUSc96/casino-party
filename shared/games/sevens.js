// 7並べ: 7は最初から並んでいる。同じマークの隣の数字を出して並べ、手札を先になくした人が勝ち
import { stdDeck, shuffle, stdLabel, SUITS, sortStd } from '../cards.js';
import { TURN_TIME, fail, ok } from './common.js';

export const meta = {
  id: 'sevens', cat: 'card', name: '7並べ', min: 2, max: 6,
  desc: '7から外側へ、同じマークの隣の数字を並べていく。出せないときだけパス。パス回数を超えると失格',
  schema: [
    { k: 'passes', type: 'select', label: 'パスできる回数', def: 3, options: [[0, 'パス不可'], [3, '3回'], [5, '5回'], [99, '無制限']] },
    TURN_TIME,
  ],
};

export function create(n, settings, { rng = Math.random } = {}) {
  const limit = Number(settings.passes ?? 3);
  const deck = shuffle(stdDeck(0).filter((c) => c.rank !== 7), rng);
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  hands.forEach(sortStd);
  // placed[マーク][数字] = null 未配置 / -2 最初の7 / -1 失格者の手札 / 席番号 出した人
  const placed = SUITS.map(() => Array(14).fill(null));
  placed.forEach((row) => { row[7] = -2; });
  const passes = Array(n).fill(0);
  const out = Array(n).fill(false);
  const finished = [];
  const elim = [];

  const playable = (c) => {
    const row = placed[SUITS.indexOf(c.suit)];
    return c.rank < 7 ? row[c.rank + 1] != null : row[c.rank - 1] != null;
  };
  const moves = (s) => hands[s].filter(playable);
  const live = () => hands.map((h, i) => (h.length ? i : -1)).filter((i) => i >= 0);
  const next = (from) => {
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (hands[s].length) return s;
    }
    return from;
  };
  const places = () => [...finished, ...live(), ...elim.slice().reverse()];

  const e = {
    status: 'playing', pending: 0, turn: Math.floor(rng() * n),
    intro: ['7はすべて並んでいます。7の隣から出していきましょう'],
    hiddenIds: (seat) => hands.flatMap((h, i) => (i === seat ? [] : h.map((c) => c.id))),

    act(seat, a) {
      if (e.status !== 'playing') return fail('ゲームは終了しています');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      const logs = [];
      if (a?.t === 'play') {
        const c = hands[seat].find((x) => x.id === a.id);
        if (!c) return fail('手札にないカードです');
        if (!playable(c)) return fail('そこにはまだ出せません（隣の数字が並んでいません）');
        placed[SUITS.indexOf(c.suit)][c.rank] = seat;
        hands[seat] = hands[seat].filter((x) => x !== c);
        logs.push(`@${seat}: ${stdLabel(c)}`);
        if (!hands[seat].length) { finished.push(seat); logs.push(`@${seat} あがり！（${finished.length}位）`); }
      } else if (a?.t === 'pass') {
        if (moves(seat).length) return fail('出せるカードがあるのでパスできません');
        passes[seat]++;
        if (passes[seat] > limit) {
          for (const c of hands[seat]) placed[SUITS.indexOf(c.suit)][c.rank] = -1;
          hands[seat] = [];
          out[seat] = true;
          elim.push(seat);
          logs.push(`@${seat} はパス回数を超えて失格！ 手札を場に出しました`);
        } else {
          logs.push(`@${seat}: パス${limit >= 99 ? '' : `（あと${limit - passes[seat]}回）`}`);
        }
      } else return fail('不正な操作です');
      if (live().length <= 1) {
        e.status = 'gameEnd';
        e.turn = -1;
        logs.push('ゲーム終了！');
      } else e.turn = next(seat);
      return ok(logs);
    },
    resolve: () => [],
    nextRound: () => [],
    cpu(seat) {
      const mv = moves(seat);
      if (!mv.length) return { t: 'pass' };
      // 同じマークで自分がさらに外側を持っているカードを優先（自分の手で道をふさがない）
      const score = (c) => hands[seat].filter((x) => x.suit === c.suit && (c.rank < 7 ? x.rank < c.rank : x.rank > c.rank)).length + rng() * 0.5;
      mv.sort((a, b) => score(b) - score(a));
      return { t: 'play', id: mv[0].id };
    },
    auto(seat) {
      const mv = moves(seat);
      return mv.length ? { t: 'play', id: mv[0].id } : { t: 'pass' };
    },

    view(seat) {
      const g = {
        hand: seat >= 0 ? hands[seat] : [],
        table: placed.map((row) => row.slice(1, 14)),
        counts: hands.map((h) => h.length),
        passesLeft: passes.map((p) => (limit >= 99 ? null : Math.max(0, limit - p))),
        out, place: hands.map((_h, i) => finished.indexOf(i) + 1),
        playable: seat >= 0 ? moves(seat).map((c) => c.id) : [],
      };
      if (e.status === 'gameEnd') {
        g.result = {
          title: '7並べ 結果', headers: ['順位', '名前', '結果'], final: true,
          rows: places().map((s, i) => ({
            cells: [i + 1, '@' + s, finished.includes(s) ? 'あがり' : out[s] ? '失格' : `残り${hands[s].length}枚`],
            me: s === seat, gold: i === 0,
          })),
        };
      }
      return g;
    },
  };
  return e;
}
