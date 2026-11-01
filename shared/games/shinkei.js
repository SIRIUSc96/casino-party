// 神経衰弱: 2枚ずつめくって、同じ数字・同じ色（赤/黒）のペアを揃える。多く取った人の勝ち
import { stdDeck, shuffle, stdLabel, isRed } from '../cards.js';
import { TURN_TIME, fail, ok } from './common.js';

export const meta = {
  id: 'shinkei', cat: 'card', name: '神経衰弱', min: 2, max: 6,
  desc: '2枚ずつめくって、同じ数字・同じ色のペアを揃えよう。揃えたらもう1回。多くペアを取った人の勝ち',
  schema: [
    { k: 'pairs', type: 'select', label: 'ペアの数', def: 18, options: [[10, '10組（20枚）'], [18, '18組（36枚）'], [27, '27組（54枚・全部）']] },
    TURN_TIME,
  ],
};

const keyOf = (c) => (c.suit === 'J' ? 'J' : `${c.rank}${isRed(c) ? 'R' : 'B'}`);

export function create(n, settings, { rng = Math.random } = {}) {
  const std = stdDeck(2);
  const groups = {};
  for (const c of std) (groups[keyOf(c)] ||= []).push(c);
  const chosen = shuffle(Object.values(groups), rng).slice(0, Number(settings.pairs) || 18);
  const cards = shuffle(chosen.flat(), rng);
  const board = cards.map((card) => ({ card, state: 0, by: -1 })); // state 0 伏せ / 1 表（一時） / 2 取得済み
  const cols = board.length <= 20 ? 5 : board.length <= 36 ? 6 : 9;
  const scores = Array(n).fill(0);
  const flipped = [];
  const seen = new Map(); // 公開された未取得カードの記憶（CPU用）: index -> key
  let matched = false;

  const e = {
    status: 'playing', pending: 0, turn: Math.floor(rng() * n),
    intro: [`${board.length}枚で開始！ 2枚ずつめくって、同じ数字・同じ色のペアを探そう`],
    hiddenIds: () => board.filter((b) => b.state === 0).map((b) => b.card.id),

    act(seat, a) {
      if (e.status !== 'playing') return fail('ゲームは終了しています');
      if (e.pending) return fail('少し待ってください');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      const i = Math.trunc(Number(a?.i));
      if (a?.t !== 'flip' || !(i >= 0 && i < board.length) || board[i].state !== 0) return fail('そのカードは選べません');
      board[i].state = 1;
      flipped.push(i);
      seen.set(i, keyOf(board[i].card));
      if (flipped.length === 2) {
        matched = keyOf(board[flipped[0]].card) === keyOf(board[flipped[1]].card);
        e.pending = matched ? 900 : 1700;
      }
      return ok([]);
    },
    resolve() {
      e.pending = 0;
      if (flipped.length < 2) return [];
      const [a, b] = flipped;
      const logs = [];
      if (matched) {
        for (const i of [a, b]) { board[i].state = 2; board[i].by = e.turn; seen.delete(i); }
        scores[e.turn]++;
        logs.push(`@${e.turn} がペア成立！ ${stdLabel(board[a].card)} ${stdLabel(board[b].card)}（${scores[e.turn]}組）`);
        flipped.length = 0;
        if (board.every((x) => x.state === 2)) {
          e.status = 'gameEnd';
          e.turn = -1;
          logs.push('全部めくれました！ ゲーム終了');
        }
      } else {
        board[a].state = 0;
        board[b].state = 0;
        flipped.length = 0;
        e.turn = (e.turn + 1) % n;
      }
      return logs;
    },
    nextRound: () => [],
    cpu() {
      const free = board.map((b, i) => (b.state === 0 ? i : -1)).filter((i) => i >= 0);
      const recall = (i) => seen.has(i) && rng() < 0.85; // ときどき忘れる
      const pick = (pool) => ({ t: 'flip', i: pool[Math.floor(rng() * pool.length)] });
      if (flipped.length === 0) {
        const byKey = {};
        for (const i of free.filter(recall)) {
          const k = seen.get(i);
          if (k in byKey) return { t: 'flip', i: byKey[k] };
          byKey[k] = i;
        }
        const unseen = free.filter((i) => !seen.has(i));
        return pick(unseen.length ? unseen : free);
      }
      const k0 = seen.get(flipped[0]);
      const partner = free.find((i) => seen.get(i) === k0 && recall(i));
      if (partner !== undefined) return { t: 'flip', i: partner };
      const unseen = free.filter((i) => !seen.has(i));
      return pick(unseen.length ? unseen : free);
    },
    auto() {
      const free = board.map((b, i) => (b.state === 0 ? i : -1)).filter((i) => i >= 0);
      return { t: 'flip', i: free[Math.floor(rng() * free.length)] };
    },

    view() {
      const g = {
        board: board.map((b) => (b.state === 0 ? { s: 0 } : { s: b.state, c: b.card, by: b.by })),
        cols, scores: [...scores], flipped: [...flipped], pending: !!e.pending, matchPending: !!e.pending && matched,
        left: board.filter((b) => b.state !== 2).length / 2,
      };
      if (e.status === 'gameEnd') {
        const order = scores.map((sc, s) => ({ s, sc })).sort((a, b) => b.sc - a.sc);
        g.result = {
          title: '神経衰弱 結果', headers: ['順位', '名前', 'ペア'], final: true,
          rows: order.map((o) => ({ cells: [1 + scores.filter((x) => x > o.sc).length, '@' + o.s, o.sc + '組'], me: false, gold: o.sc === order[0].sc })),
        };
      }
      return g;
    },
  };
  return e;
}
