// 大富豪 — ルール本体は ../rules.js。ここは共通インターフェースへの薄い橋渡し
import * as R from '../rules.js';
import { TURN_TIME, fail, ok } from './common.js';

const B = (k, label, hint) => ({ k, type: 'bool', label, hint, def: R.DEFAULT_RULES[k] });

export const meta = {
  id: 'daifugo', cat: 'card', name: '大富豪', min: 3, max: 5,
  desc: '強いカードで場を支配し、いち早く手札をなくそう。革命や8切りなどのローカルルールも選べる',
  schema: [
    B('eight', '8切り', '8を出すと場が流れる'),
    B('revolution', '革命', '同じ数字4枚以上で強さ逆転'),
    B('lock', '縛り', '同じマークが続くと縛り'),
    B('sequence', '階段', '同マーク3枚以上の連番'),
    B('spe3', 'スペ3返し', 'ジョーカーに♠3'),
    B('miyakoochi', '都落ち', '大富豪が1位を逃すと大貧民'),
    B('back11', '11バック', 'Jで強さ一時逆転'),
    B('skip5', '5スキップ', '5で次の人を飛ばす'),
    { k: 'jokers', type: 'select', label: 'ジョーカー', def: 2, options: [[0, 'なし'], [1, '1枚'], [2, '2枚']] },
    { k: 'rounds', type: 'select', label: 'ラウンド数', def: 3, options: [[1, '1'], [3, '3'], [5, '5'], [10, '10']] },
    TURN_TIME,
  ],
};

function describe(res) {
  if (res.pass) return `@${res.seat}: パス`;
  let line = `@${res.seat}: ${res.cards.map(R.cardLabel).join(' ')}`;
  for (const ev of res.events) {
    if (ev.type === 'revolution') line += ' 【革命！】';
    if (ev.type === 'cut8') line += ' 【8切り】';
    if (ev.type === 'spe3') line += ' 【スペ3返し】';
    if (ev.type === 'lock') line += ' 【縛り】';
    if (ev.type === 'back11') line += ' 【11バック】';
    if (ev.type === 'skip') line += ` 【@${ev.seat}をスキップ】`;
    if (ev.type === 'finish') line += ` 🎉あがり（${ev.place}位）`;
  }
  return line;
}

export function create(n, settings, { rng = Math.random } = {}) {
  const game = R.newGame(n, settings);
  let r = R.startRound(game, rng);

  const e = {
    status: 'playing', pending: 0,
    get turn() { return e.status === 'playing' ? r.turn : -1; },
    intro: ['ラウンド1開始'],
    hiddenIds: (seat) => {
      // カード交換で渡した/受け取ったカードは当事者には見えてよい
      const known = new Set(r.exchange.filter((x) => x.poor === seat || x.rich === seat).flatMap((x) => [...x.up, ...x.down].map((c) => c.id)));
      return r.hands.flatMap((h, i) => (i === seat ? [] : h.map((c) => c.id))).filter((id) => !known.has(id));
    },

    act(seat, a) {
      if (e.status !== 'playing') return fail('ラウンドは終了しています');
      let res;
      if (a?.t === 'play') res = R.play(r, seat, a.ids);
      else if (a?.t === 'pass') res = R.pass(r, seat);
      else return fail('不正な操作です');
      if (!res.ok) return fail(res.error);
      const logs = [describe(res)];
      if (r.over) {
        const gameOver = R.finishRound(game, r);
        e.status = gameOver ? 'gameEnd' : 'roundEnd';
        logs.push(`ラウンド終了: ${r.places.map((s, i) => `${i + 1}位 @${s}（${R.roleName(i, r.n)}）`).join(' / ')}`);
      }
      return ok(logs);
    },
    resolve: () => [],
    nextRound() {
      r = R.startRound(game, rng);
      e.status = 'playing';
      const logs = [`ラウンド${game.roundNo + 1}開始`];
      if (r.exchange.length) logs.push('カード交換を行いました');
      return logs;
    },
    cpu(seat) {
      const c = R.cpuChoose(r, seat, rng);
      return c.pass ? { t: 'pass' } : { t: 'play', ids: c.ids };
    },
    auto(seat) {
      const c = R.autoChoose(r, seat);
      return c.pass ? { t: 'pass' } : { t: 'play', ids: c.ids };
    },

    view(seat) {
      const g = {
        roundNo: game.roundNo + (e.status === 'playing' ? 1 : 0), totalRounds: game.rules.rounds, rules: game.rules,
        seats: r.hands.map((h, i) => {
          const fi = r.finished.indexOf(i);
          return {
            count: h.length, score: game.scores[i],
            place: r.places ? r.places.indexOf(i) + 1 : fi >= 0 ? fi + 1 : 0,
            role: r.prevPlaces ? R.roleName(r.prevPlaces.indexOf(i), r.n) : '',
          };
        }),
        field: r.field ? { cards: r.field.cards, owner: r.field.owner, interp: r.field.interp } : null,
        lock: r.lock, rev: r.rev, back: r.back,
        hand: seat >= 0 ? r.hands[seat] : [],
      };
      // カード交換は当事者にだけ見せる
      if (e.status === 'playing' && r.exchange.length) {
        g.exchange = r.exchange.filter((x) => x.poor === seat || x.rich === seat).map((x) => ({ poor: x.poor, rich: x.rich, up: x.up, down: x.down }));
      }
      if (e.status === 'roundEnd') {
        g.result = {
          title: `ラウンド${game.roundNo}の結果`, headers: ['順位', '名前', '階級', '今回', '合計'], final: false,
          rows: r.places.map((s, i) => ({ cells: [i + 1, '@' + s, R.roleName(i, n), '+' + (n - 1 - i), game.scores[s]], me: s === seat, gold: i === 0 })),
        };
      } else if (e.status === 'gameEnd') {
        const order = game.scores.map((sc, s) => ({ s, sc })).sort((a, b) => b.sc - a.sc);
        g.result = {
          title: '🏆 最終結果', headers: ['順位', '名前', '合計'], final: true,
          rows: order.map((o, i) => ({ cells: [i + 1, '@' + o.s, o.sc + 'pt'], me: o.s === seat, gold: i === 0 })),
        };
      }
      return g;
    },
  };
  return e;
}
