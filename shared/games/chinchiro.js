// チンチロ: 親と子に分かれてサイコロ3つを振り、役の強さで勝負。親は順番に交代
import { fail, ok } from './common.js';

export const meta = {
  id: 'chinchiro', cat: 'casino', name: 'チンチロ', min: 2, max: 6,
  desc: '親と子に分かれてサイコロ3つを最大3回まで振り、役の強さで勝負。ピンゾロ5倍・ゾロ目3倍・シゴロ2倍、ヒフミは倍払い。親は順番に交代',
  schema: [
    { k: 'laps', type: 'select', label: '親が回る回数', def: 1, options: [[1, '全員1回ずつ'], [2, '全員2回ずつ']] },
    { k: 'bet', type: 'select', label: '1回の賭け金', def: 50, options: [[10, '10'], [50, '50'], [100, '100']] },
    { k: 'chips', type: 'select', label: '初期チップ', def: 500, options: [[200, '200'], [500, '500'], [1000, '1000']] },
  ],
};

// 役の判定。strength: 大きいほど強い / mult: 勝ったときの倍率（ヒフミを相手にすると2倍）
export function judge(d) {
  const [a, b, c] = [...d].sort((x, y) => x - y);
  if (a === 1 && b === 1 && c === 1) return { name: 'ピンゾロ', strength: 100, mult: 5 };
  if (a === b && b === c) return { name: `${a}のゾロ目`, strength: 90 + a, mult: 3 };
  if (a === 4 && b === 5 && c === 6) return { name: 'シゴロ', strength: 80, mult: 2 };
  if (a === 1 && b === 2 && c === 3) return { name: 'ヒフミ', strength: -1, mult: 2 };
  if (a === b) return { name: `目 ${c}`, strength: 10 + c, mult: 1 };
  if (b === c) return { name: `目 ${a}`, strength: 10 + a, mult: 1 };
  return null; // 目なし
}
const NOROLE = { name: '目なし', strength: 0, mult: 1 };

export function create(n, settings, { rng = Math.random } = {}) {
  const stake = Number(settings.bet) || 50;
  const laps = Number(settings.laps) || 1;
  const totalRounds = n * laps;
  const chips = Array(n).fill(Number(settings.chips) || 500);
  let roundNo = 0, parent = 0, order = [], idx = 0, dice = null, rolls = 0, hands = [], settled = null;
  const history = [];
  const d6 = () => 1 + Math.floor(rng() * 6);

  const e = { status: 'playing', turn: -1, pending: 0, pendingVisible: false, roundWait: 9000, hiddenIds: () => [] };

  function startRound() {
    roundNo++;
    parent = (roundNo - 1) % n;
    order = [parent, ...Array.from({ length: n - 1 }, (_x, k) => (parent + 1 + k) % n)];
    idx = 0; dice = null; rolls = 0; hands = Array(n).fill(null); settled = null;
    e.turn = order[0]; e.status = 'playing';
    return [`ラウンド${roundNo}／${totalRounds} 親は @${parent}（1人 ${stake} チップ）`];
  }

  function settle() {
    const p = hands[parent];
    const rows = [];
    for (const s of order.slice(1)) {
      const c = hands[s];
      let delta = 0;
      if (c.strength !== p.strength) {
        const childWins = c.strength > p.strength;
        const win = childWins ? c : p, lose = childWins ? p : c;
        const mult = lose.name === 'ヒフミ' ? Math.max(2, win.mult) : win.mult;
        const want = stake * mult;
        const from = childWins ? parent : s, to = childWins ? s : parent;
        const pay = Math.min(want, Math.max(0, chips[from])); // 払える分だけ
        chips[from] -= pay; chips[to] += pay;
        delta = childWins ? pay : -pay;
      }
      rows.push({ s, delta });
    }
    settled = rows;
    return rows.map((r) => `@${r.s}（${hands[r.s].name}）vs 親（${p.name}）: ${r.delta > 0 ? '+' : ''}${r.delta}`);
  }

  Object.assign(e, {
    act(seat, a) {
      if (e.status !== 'playing') return fail('いまは操作できません');
      if (e.pending) return fail('少し待ってください');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      if (a?.t !== 'roll') return fail('不正な操作です');
      dice = [d6(), d6(), d6()]; rolls++;
      const j = judge(dice);
      const label = j ? j.name : '目なし';
      e.pending = 1300; e.pendingVisible = false;
      return ok([`@${seat}: ${dice.join('・')} → ${label}${!j && rolls < 3 ? `（${rolls}回目）` : ''}`]);
    },
    resolve() {
      e.pending = 0;
      if (!dice) return [];
      const s = order[idx], j = judge(dice);
      if (!j && rolls < 3) return []; // 同じ人がもう一度振る
      hands[s] = j || NOROLE;
      const logs = [];
      idx++; dice = null; rolls = 0;
      if (idx >= order.length) {
        logs.push(...settle());
        history.push(`親@${parent}`);
        e.turn = -1;
        e.status = roundNo >= totalRounds ? 'gameEnd' : 'roundEnd';
      } else e.turn = order[idx];
      return logs;
    },
    nextRound: startRound,
    cpu() { return { t: 'roll' }; },
    auto() { return { t: 'roll' }; },

    view(seat) {
      const g = {
        roundNo, totalRounds, parent, stake, chips: [...chips], order: [...order], cur: e.status === 'playing' ? order[idx] : -1,
        dice: dice ? [...dice] : null, rolls, hands: hands.map((h) => (h ? { name: h.name, strength: h.strength } : null)),
        settled, busy: !!e.pending, phase: e.status === 'playing' ? 'roll' : 'done',
      };
      if (e.status === 'roundEnd' || e.status === 'gameEnd') {
        if (e.status === 'roundEnd') {
          g.result = {
            title: `ラウンド${roundNo}の結果（親 @${parent}）`, headers: ['名前', '役', '増減', 'チップ'], final: false,
            rows: order.map((s) => {
              const d = s === parent ? -settled.reduce((a, r) => a + r.delta, 0) : settled.find((r) => r.s === s).delta;
              return { cells: ['@' + s, hands[s].name + (s === parent ? '（親）' : ''), (d >= 0 ? '+' : '') + d, chips[s]], me: s === seat, gold: d > 0 };
            }),
          };
        } else {
          const ord = chips.map((c, s) => ({ s, c })).sort((a, b) => b.c - a.c);
          g.result = {
            title: '🏆 最終結果', headers: ['順位', '名前', 'チップ'], final: true,
            rows: ord.map((o, i) => ({ cells: [1 + chips.filter((x) => x > o.c).length, '@' + o.s, o.c], me: o.s === seat, gold: i === 0 })),
          };
        }
      }
      return g;
    },
  });
  e.intro = startRound();
  return e;
}
