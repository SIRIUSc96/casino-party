// ブラックジャック: ディーラーと勝負。合計を21に近づける（超えたらバスト）
import { stdDeck, shuffle, stdLabel } from '../cards.js';
import { TURN_TIME, fail, ok } from './common.js';

export const meta = {
  id: 'blackjack', cat: 'casino', name: 'ブラックジャック', min: 1, max: 6,
  desc: 'ディーラーと勝負。カードの合計を21に近づけよう（超えるとバスト）。最後にチップが多い人の勝ち',
  schema: [
    { k: 'rounds', type: 'select', label: '回数', def: 5, options: [[3, '3回'], [5, '5回'], [10, '10回']] },
    { k: 'bet', type: 'select', label: '1回の賭け金', def: 20, options: [[10, '10'], [20, '20'], [50, '50']] },
    TURN_TIME,
  ],
};

const START_CHIPS = 200;
const val = (c) => (c.rank === 1 ? 11 : Math.min(c.rank, 10));
export function handInfo(h) {
  let t = 0, aces = 0;
  for (const c of h) { t += val(c); if (c.rank === 1) aces++; }
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
}

export function create(n, settings, { rng = Math.random } = {}) {
  const rounds = Number(settings.rounds ?? 5);
  const betSet = Number(settings.bet ?? 20);
  const chips = Array(n).fill(START_CHIPS);
  let roundNo = 0, shoe = [], dealer = [], revealed = false, phase = 'players';
  let hands = [], bets = [], states = [], doubled = [], outcomes = [];
  const draw = () => shoe.pop();
  const labels = (h) => h.map(stdLabel).join(' ');

  const e = { status: 'playing', pending: 0, turn: -1 };

  function startRound() {
    roundNo++;
    shoe = [];
    for (let d = 0; d < 4; d++) for (const c of stdDeck(0)) shoe.push({ ...c, id: `${c.id}#${d}` });
    shuffle(shoe, rng);
    dealer = []; revealed = false; outcomes = Array(n).fill(null);
    hands = Array.from({ length: n }, () => []);
    bets = Array(n).fill(0); states = Array(n).fill('out'); doubled = Array(n).fill(false);
    const logs = [`ラウンド${roundNo}開始（賭け金 ${betSet}）`];
    for (let s = 0; s < n; s++) {
      if (chips[s] > 0) { bets[s] = Math.min(betSet, chips[s]); chips[s] -= bets[s]; states[s] = 'play'; }
    }
    for (let k = 0; k < 2; k++) {
      for (let s = 0; s < n; s++) if (states[s] !== 'out') hands[s].push(draw());
      dealer.push(draw());
    }
    for (let s = 0; s < n; s++) {
      if (states[s] === 'play' && handInfo(hands[s]).total === 21) { states[s] = 'bj'; logs.push(`@${s} ブラックジャック！`); }
    }
    const first = states.indexOf('play');
    if (handInfo(dealer).total === 21 || first < 0) { phase = 'dealer'; e.turn = -1; e.pending = 900; }
    else { phase = 'players'; e.turn = first; e.pending = 0; }
    return logs;
  }

  function advance(from) {
    for (let k = 1; k <= n; k++) {
      const s = (from + k) % n;
      if (states[s] === 'play') { e.turn = s; return; }
    }
    phase = 'dealer'; e.turn = -1; e.pending = 900;
  }

  function settle() {
    const dt = handInfo(dealer).total;
    const dBJ = dealer.length === 2 && dt === 21;
    const logs = [];
    for (let s = 0; s < n; s++) {
      const st = states[s];
      if (st === 'out') continue;
      const p = handInfo(hands[s]).total;
      let pay = 0, text;
      if (st === 'bust') text = 'バスト';
      else if (st === 'bj') { if (dBJ) { pay = bets[s]; text = '引き分け'; } else { pay = Math.floor(bets[s] * 2.5); text = 'ブラックジャック'; } }
      else if (dBJ) text = '負け';
      else if (dt > 21 || p > dt) { pay = bets[s] * 2; text = '勝ち'; }
      else if (p === dt) { pay = bets[s]; text = '引き分け'; }
      else text = '負け';
      chips[s] += pay;
      outcomes[s] = { text, delta: pay - bets[s] };
      logs.push(`@${s}: ${text}（${pay - bets[s] >= 0 ? '+' : ''}${pay - bets[s]}）`);
    }
    phase = 'settled'; e.turn = -1; e.pending = 0;
    e.status = roundNo >= rounds || chips.every((c) => c <= 0) ? 'gameEnd' : 'roundEnd';
    return logs;
  }

  Object.assign(e, {
    hiddenIds: () => (revealed || !dealer[1] ? [] : [dealer[1].id]),

    act(seat, a) {
      if (e.status !== 'playing' || phase !== 'players') return fail('いまは操作できません');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      const logs = [];
      const h = hands[seat];
      if (a?.t === 'hit') {
        const c = draw(); h.push(c);
        const { total } = handInfo(h);
        logs.push(`@${seat}: ヒット ${stdLabel(c)}（合計${total}）`);
        if (total > 21) { states[seat] = 'bust'; logs.push(`@${seat} バスト！`); }
        else if (total === 21) states[seat] = 'stand';
      } else if (a?.t === 'stand') {
        states[seat] = 'stand';
        logs.push(`@${seat}: スタンド（合計${handInfo(h).total}）`);
      } else if (a?.t === 'double') {
        if (h.length !== 2 || chips[seat] < bets[seat]) return fail('ダブルダウンできません（最初の2枚のときだけ・チップが必要）');
        chips[seat] -= bets[seat]; bets[seat] *= 2; doubled[seat] = true;
        const c = draw(); h.push(c);
        const { total } = handInfo(h);
        states[seat] = total > 21 ? 'bust' : 'stand';
        logs.push(`@${seat}: ダブルダウン ${stdLabel(c)}（合計${total}）${total > 21 ? ' バスト！' : ''}`);
      } else return fail('不正な操作です');
      if (states[seat] !== 'play') advance(seat);
      return ok(logs);
    },
    resolve() {
      if (phase !== 'dealer') { e.pending = 0; return []; }
      if (!revealed) {
        revealed = true; e.pending = 900;
        return [`ディーラー: ${labels(dealer)}（合計${handInfo(dealer).total}）`];
      }
      const t = handInfo(dealer).total;
      if (t < 17 && states.some((s) => s === 'stand')) {
        const c = draw(); dealer.push(c); e.pending = 900;
        return [`ディーラー: ヒット ${stdLabel(c)}（合計${handInfo(dealer).total}）`];
      }
      return settle();
    },
    nextRound() { e.status = 'playing'; return startRound(); },
    cpu(seat) {
      const h = hands[seat];
      const { total, soft } = handInfo(h);
      const up = val(dealer[0]);
      if (h.length === 2 && chips[seat] >= bets[seat] && (total === 11 || (total === 10 && up < 10)) && rng() < 0.85) return { t: 'double' };
      let hit;
      if (soft) hit = total <= 17 || (total === 18 && up >= 9);
      else if (total <= 11) hit = true;
      else if (total <= 16) hit = up >= 7;
      else hit = false;
      return { t: hit ? 'hit' : 'stand' };
    },
    auto(seat) { return { t: handInfo(hands[seat]).total < 12 ? 'hit' : 'stand' }; },

    view(seat) {
      const di = handInfo(dealer);
      const g = {
        phase, roundNo, totalRounds: rounds, bet: betSet,
        dealer: { cards: revealed ? dealer : [dealer[0], { hidden: true }], total: revealed ? di.total : null },
        players: hands.map((h, i) => ({
          cards: h, total: h.length ? handInfo(h).total : 0, soft: h.length ? handInfo(h).soft : false,
          bet: bets[i], chips: chips[i], state: states[i], doubled: doubled[i], outcome: outcomes[i],
        })),
        canDouble: seat >= 0 && phase === 'players' && e.turn === seat && hands[seat].length === 2 && chips[seat] >= bets[seat],
      };
      if (e.status === 'roundEnd') {
        g.result = {
          title: `ラウンド${roundNo}の結果（ディーラー ${di.total}${di.total > 21 ? ' バスト' : ''}）`,
          headers: ['名前', '手札', '結果', '増減', 'チップ'], final: false,
          rows: states.map((st, s) => (st === 'out' ? null : {
            cells: ['@' + s, `${hands[s].map(stdLabel).join(' ')} = ${handInfo(hands[s]).total}`, outcomes[s].text, (outcomes[s].delta >= 0 ? '+' : '') + outcomes[s].delta, chips[s]],
            me: s === seat, gold: false,
          })).filter(Boolean),
        };
      } else if (e.status === 'gameEnd') {
        const order = chips.map((c, s) => ({ s, c })).sort((a, b) => b.c - a.c);
        g.result = {
          title: '🏆 最終結果', headers: ['順位', '名前', 'チップ'], final: true,
          rows: order.map((o, i) => ({ cells: [1 + chips.filter((x) => x > o.c).length, '@' + o.s, o.c], me: o.s === seat, gold: i === 0 })),
        };
      }
      return g;
    },
  });

  e.intro = startRound();
  return e;
}
