// 1d1025ダイス: 全員が順番に1つのサイコロ（既定は1〜1025）を振り、いちばん大きい出目の人がそのラウンドの勝ち。結果は履歴に残る
import { fail, ok } from './common.js';

export const meta = {
  id: 'dice', cat: 'casino', name: '1d1025ダイス', min: 1, max: 6,
  desc: '全員が順番に、1〜1025のサイコロを1回ずつ振る。いちばん大きい出目がそのラウンドの勝ち。全員の出目が履歴に残る',
  schema: [
    { k: 'rounds', type: 'select', label: 'ラウンド数', def: 1, options: [[1, '1回'], [3, '3回'], [5, '5回'], [10, '10回']] },
    { k: 'sides', type: 'select', label: 'サイコロの面数', def: 1025, options: [[1025, '1025（1d1025）'], [100, '100'], [20, '20'], [6, '6']] },
  ],
};

export function create(n, settings, { rng = Math.random } = {}) {
  const sides = Number(settings.sides) || 1025;
  const totalRounds = Number(settings.rounds) || 1;
  let roundNo = 0, idx = 0, cur = null;
  let values = Array(n).fill(null); // このラウンドの出目
  const table = [];                 // 終わったラウンドの出目
  const wins = Array(n).fill(0);
  const sums = Array(n).fill(0);
  let lastWinners = [];

  const e = { status: 'playing', turn: 0, pending: 0, pendingVisible: false, roundWait: 9000, hiddenIds: () => [] };

  function startRound() {
    roundNo++; idx = 0; cur = null; values = Array(n).fill(null);
    e.turn = 0; e.status = 'playing';
    return [`ラウンド${roundNo}／${totalRounds}　1〜${sides} のサイコロを順番に振ります`];
  }

  Object.assign(e, {
    act(seat, a) {
      if (e.status !== 'playing') return fail('いまは操作できません');
      if (e.pending) return fail('少し待ってください');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      if (a?.t !== 'roll') return fail('不正な操作です');
      cur = 1 + Math.floor(rng() * sides);
      values[seat] = cur;
      e.pending = 1100; e.pendingVisible = false;
      const tag = cur === sides ? '　最大値！' : cur === 1 ? '　最小値…' : '';
      return ok([`@${seat}: ${cur}（1〜${sides}）${tag}`]);
    },
    resolve() {
      e.pending = 0;
      if (cur === null) return [];
      cur = null; idx++;
      if (idx < n) { e.turn = idx; return []; }
      // 全員振り終わった
      const max = Math.max(...values);
      lastWinners = values.map((x, s) => (x === max ? s : -1)).filter((s) => s >= 0);
      for (let s = 0; s < n; s++) sums[s] += values[s];
      for (const s of lastWinners) wins[s]++;
      table.push([...values]);
      e.turn = -1;
      e.status = roundNo >= totalRounds ? 'gameEnd' : 'roundEnd';
      return [lastWinners.length === 1 ? `ラウンド${roundNo}の勝ち: @${lastWinners[0]}（${max}）` : `ラウンド${roundNo}は同点（${max}）: ${lastWinners.map((s) => '@' + s).join('・')}`];
    },
    nextRound: startRound,
    cpu() { return { t: 'roll' }; },
    auto() { return { t: 'roll' }; },

    view(seat) {
      const g = {
        roundNo, totalRounds, sides, cur: e.status === 'playing' ? idx : -1,
        values: [...values], last: cur, busy: !!e.pending,
        table: table.map((r) => [...r]), wins: [...wins], sums: [...sums], winners: [...lastWinners],
        phase: e.status === 'playing' ? 'roll' : 'done',
      };
      if (e.status === 'roundEnd') {
        g.result = {
          title: `ラウンド${roundNo}の結果`, headers: ['名前', '出目', '勝ち数'], final: false,
          rows: values.map((x, s) => ({ cells: ['@' + s, x, wins[s]], me: s === seat, gold: lastWinners.includes(s) })),
        };
      } else if (e.status === 'gameEnd') {
        const ord = wins.map((w, s) => ({ s, w, t: sums[s] })).sort((a, b) => b.w - a.w || b.t - a.t);
        const better = (x, y) => x.w > y.w || (x.w === y.w && x.t > y.t);
        g.result = {
          title: '🏆 最終結果', headers: ['順位', '名前', '勝ち数', '出目の合計'], final: true,
          rows: ord.map((o, i) => ({ cells: [1 + ord.filter((x) => better(x, o)).length, '@' + o.s, o.w, o.t], me: o.s === seat, gold: i === 0 })),
        };
      }
      return g;
    },
  });
  e.intro = startRound();
  return e;
}
