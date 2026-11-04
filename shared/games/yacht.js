// ヨット: サイコロ5つを最大3回まで振り（残したい目はキープ）、12個の役欄に1つずつ得点を記入。12ラウンド後の合計点で勝負
import { fail, ok, TURN_TIME } from './common.js';

export const meta = {
  id: 'yacht', cat: 'casino', name: 'ヨット', min: 2, max: 6,
  desc: 'サイコロ5つを最大3回まで振って役を作り、12個の欄に1回ずつ記入。1〜6の合計が63点以上でボーナス+35。ヨット（5つ同じ）は50点',
  schema: [TURN_TIME],
};

export const CATS = [
  { id: 'n1', name: '1の目', upper: true }, { id: 'n2', name: '2の目', upper: true }, { id: 'n3', name: '3の目', upper: true },
  { id: 'n4', name: '4の目', upper: true }, { id: 'n5', name: '5の目', upper: true }, { id: 'n6', name: '6の目', upper: true },
  { id: 'choice', name: 'チョイス' }, { id: 'four', name: 'フォーカード' }, { id: 'full', name: 'フルハウス' },
  { id: 'small', name: 'Sストレート' }, { id: 'big', name: 'Bストレート' }, { id: 'yacht', name: 'ヨット' },
];
const IDS = CATS.map((c) => c.id);
export const BONUS_LINE = 63, BONUS = 35;

const sum = (d) => d.reduce((a, b) => a + b, 0);
const counts = (d) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const x of d) c[x]++; return c; };

// 出目 d（5個）をその役に記入したときの得点
export function scoreOf(cat, d) {
  const c = counts(d), vals = c.slice(1);
  if (cat[0] === 'n' && cat.length === 2) return Number(cat[1]) * c[Number(cat[1])];
  switch (cat) {
    case 'choice': return sum(d);
    case 'four': return vals.some((x) => x >= 4) ? sum(d) : 0;
    case 'full': return vals.includes(3) && vals.includes(2) ? sum(d) : 0;
    case 'small': {
      const has = (a) => [a, a + 1, a + 2, a + 3].every((x) => c[x] > 0);
      return has(1) || has(2) || has(3) ? 15 : 0;
    }
    case 'big': return [1, 2, 3, 4, 5].every((x) => c[x] > 0) || [2, 3, 4, 5, 6].every((x) => c[x] > 0) ? 30 : 0;
    case 'yacht': return vals.includes(5) ? 50 : 0;
    default: return 0;
  }
}

// CPU用: その役に入れるときの「平均的な得点」との差で選ぶための目安
const PAR = { n1: 3, n2: 6, n3: 9, n4: 12, n5: 15, n6: 18, choice: 22, four: 14, full: 16, small: 10, big: 12, yacht: 10 };

export function create(n, settings, { rng = Math.random } = {}) {
  const totalRounds = CATS.length;
  const scores = Array.from({ length: n }, () => ({}));
  let roundNo = 1, cur = 0, dice = null, held = [false, false, false, false, false], rolls = 0;
  const d6 = () => 1 + Math.floor(rng() * 6);

  const e = { status: 'playing', turn: 0, pending: 0, pendingVisible: false, roundWait: 9000, hiddenIds: () => [] };
  const open = (s) => IDS.filter((id) => !(id in scores[s]));
  const upper = (s) => IDS.slice(0, 6).reduce((a, id) => a + (scores[s][id] || 0), 0);
  const total = (s) => Object.values(scores[s]).reduce((a, b) => a + b, 0) + (upper(s) >= BONUS_LINE ? BONUS : 0);

  function bestCat(s, d) {
    let best = null, bv = -Infinity;
    for (const id of open(s)) {
      const v = scoreOf(id, d) - PAR[id];
      if (v > bv) { bv = v; best = id; }
    }
    return best;
  }

  // CPU: どの目をキープするか
  function plan(d) {
    const c = counts(d);
    let face = 6, bc = -1;
    for (let f = 6; f >= 1; f--) if (c[f] > bc) { bc = c[f]; face = f; }
    if (bc >= 3) return d.map((x) => x === face);
    // ストレートの芽（4連続）
    for (const a of [3, 2, 1]) {
      if ([a, a + 1, a + 2, a + 3].every((x) => c[x] > 0)) {
        const used = new Set(); return d.map((x) => { if (x >= a && x <= a + 3 && !used.has(x)) { used.add(x); return true; } return false; });
      }
    }
    if (bc >= 2) return d.map((x) => x === face);
    const hi = Math.max(...d); const once = { done: false };
    return d.map((x) => { if (x === hi && !once.done) { once.done = true; return true; } return false; });
  }

  Object.assign(e, {
    act(seat, a) {
      if (e.status !== 'playing') return fail('いまは操作できません');
      if (e.pending) return fail('少し待ってください');
      if (seat !== e.turn) return fail('あなたの番ではありません');
      if (a?.t === 'hold') {
        const i = Number(a.i);
        if (!dice || rolls >= 3) return fail('いまはキープできません');
        if (!(i >= 0 && i < 5)) return fail('不正な操作です');
        held[i] = !held[i];
        return ok();
      }
      if (a?.t === 'roll') {
        if (rolls >= 3) return fail('振れるのは3回までです');
        if (rolls > 0 && Array.isArray(a.keep) && a.keep.length === 5) held = a.keep.map(Boolean);
        if (rolls > 0 && held.every(Boolean)) return fail('振り直すサイコロを選んでください');
        if (!dice) dice = [0, 0, 0, 0, 0];
        for (let i = 0; i < 5; i++) if (rolls === 0 || !held[i]) dice[i] = d6();
        rolls++;
        e.pending = 1100; e.pendingVisible = false;
        return ok([`@${seat}: ${dice.join('・')}（${rolls}回目）`]);
      }
      if (a?.t === 'score') {
        if (!dice || rolls === 0) return fail('まずサイコロを振ってください');
        if (!IDS.includes(a.cat) || a.cat in scores[seat]) return fail('その欄には記入できません');
        const v = scoreOf(a.cat, dice);
        scores[seat][a.cat] = v;
        const name = CATS.find((c) => c.id === a.cat).name;
        const logs = [`@${seat}: ${name} に ${v}点`];
        const wasYacht = a.cat === 'yacht' && v === 50;
        if (wasYacht) logs.push('🎉 ヨット！！');
        dice = null; held = [false, false, false, false, false]; rolls = 0;
        cur++;
        if (cur >= n) { cur = 0; roundNo++; }
        if (roundNo > totalRounds) { e.status = 'gameEnd'; e.turn = -1; logs.push('ゲーム終了！'); }
        else e.turn = cur;
        return ok(logs);
      }
      return fail('不正な操作です');
    },
    resolve() { e.pending = 0; return []; },
    nextRound() { return []; },
    cpu(seat) {
      if (rolls === 0) return { t: 'roll' };
      if (rolls < 3) {
        const keep = plan(dice);
        const c = counts(dice);
        // 高得点がすでに出ていれば振らずに記入
        if (c.some((x) => x === 5) || (scoreOf('big', dice) && !('big' in scores[seat]))) return { t: 'score', cat: bestCat(seat, dice) };
        if (keep.every(Boolean)) return { t: 'score', cat: bestCat(seat, dice) };
        return { t: 'roll', keep };
      }
      return { t: 'score', cat: bestCat(seat, dice) };
    },
    auto(seat) {
      if (rolls === 0) return { t: 'roll' };
      return { t: 'score', cat: bestCat(seat, dice) };
    },

    view(seat) {
      const g = {
        roundNo: Math.min(roundNo, totalRounds), totalRounds, cur: e.status === 'playing' ? cur : -1,
        dice: dice ? [...dice] : null, held: [...held], rolls, busy: !!e.pending,
        scores: scores.map((s) => ({ ...s })), upper: scores.map((_s, s) => upper(s)), totals: scores.map((_s, s) => total(s)),
        cats: CATS, bonusLine: BONUS_LINE, bonus: BONUS,
        preview: null,
      };
      if (e.status === 'playing' && seat === cur && dice && rolls > 0) {
        g.preview = Object.fromEntries(open(seat).map((id) => [id, scoreOf(id, dice)]));
      }
      if (e.status === 'gameEnd') {
        const ord = scores.map((_s, s) => ({ s, t: total(s) })).sort((a, b) => b.t - a.t);
        g.result = {
          title: '🏆 最終結果', headers: ['順位', '名前', 'ボーナス', '合計'], final: true,
          rows: ord.map((o, i) => ({ cells: [1 + ord.filter((x) => x.t > o.t).length, '@' + o.s, upper(o.s) >= BONUS_LINE ? `+${BONUS}` : '-', o.t], me: o.s === seat, gold: i === 0 })),
        };
      }
      return g;
    },
  });
  e.intro = [`ヨット開始！ 全${totalRounds}ラウンド。最初は @0 の番です`];
  return e;
}
