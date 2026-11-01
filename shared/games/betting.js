// 同時ベット型カジノゲームの共通部品（ルーレット・大小・スロット）
//  ベット受付（全員同時）→ 結果の抽選（演出中は出目を伏せる）→ 精算 → 次ラウンド
//  ゲーム固有の部分は spec で渡す:
//    spec.spin(rng, seat)    出目を抽選（JSONにできる値）
//    spec.shared             true なら全員共通の出目 / false なら席ごと（スロット）
//    spec.valid(key)         ベット種別として有効か
//    spec.ret(key, outcome)  賭け金に対する払戻倍率（掛け金込み。外れは0）
//    spec.describe(outcome)  ログ・表示用の文字列
//    spec.cpuBets(rng, chips) CPUのベット [[key, amt], ...]
//    spec.spinMs             演出時間(ms)
import { fail, ok } from './common.js';

export const betSchema = (defRounds = 10) => [
  { k: 'rounds', type: 'select', label: '回数', def: defRounds, options: [[5, '5回'], [10, '10回'], [20, '20回']] },
  { k: 'chips', type: 'select', label: '初期チップ', def: 500, options: [[200, '200'], [500, '500'], [1000, '1000']] },
  { k: 'betTime', type: 'select', label: 'ベット時間', def: 20, options: [[10, '10秒'], [20, '20秒'], [40, '40秒']] },
];

// CPU用: 所持チップの一部を1口の賭け金にする
export const cpuUnit = (rng, chips) => Math.max(1, Math.min(chips, Math.round((chips * (0.04 + rng() * 0.1)) / 10) * 10 || 10));

export function createBetting(n, settings, { rng = Math.random, isCpu = () => false } = {}, spec) {
  const rounds = Number(settings.rounds) || 10;
  const betMs = (Number(settings.betTime) || 20) * 1000;
  const chips = Array(n).fill(Number(settings.chips) || 500);
  let roundNo = 0, phase = 'bet', bets = [], ready = [], outs = null, shown = null, paid = [], seq = 0;
  const last = Array(n).fill(null);
  const history = [];
  const total = (s) => Object.values(bets[s]).reduce((a, b) => a + b, 0);

  const e = { status: 'playing', turn: -1, pending: 0, pendingVisible: false, pendingSeq: 0, roundWait: 8000, hiddenIds: () => [] };
  const setPending = (ms, vis) => { e.pending = ms; e.pendingVisible = vis; e.pendingSeq = ++seq; };
  const place = (s, key, amt) => { bets[s][key] = (bets[s][key] || 0) + amt; chips[s] -= amt; };

  function startRound() {
    roundNo++; phase = 'bet'; outs = null; shown = null; paid = Array(n).fill(0);
    bets = Array.from({ length: n }, () => ({}));
    ready = Array(n).fill(false);
    for (let s = 0; s < n; s++) {
      if (chips[s] <= 0) { ready[s] = true; continue; }
      if (isCpu(s)) {
        for (const [k, a] of spec.cpuBets(rng, chips[s])) if (spec.valid(k) && a >= 1 && a <= chips[s]) place(s, k, a);
        ready[s] = true;
      }
    }
    e.status = 'playing';
    setPending(betMs, true);
    return [`ラウンド${roundNo}／${rounds} ベット受付中`];
  }

  const humansReady = () => ready.every((r, s) => r || isCpu(s));

  Object.assign(e, {
    act(seat, a) {
      if (e.status !== 'playing' || phase !== 'bet') return fail('いまはベットできません');
      if (!(seat >= 0 && seat < n)) return fail('観戦中です');
      const t = a?.t;
      if (t === 'ready') {
        ready[seat] = true;
        if (humansReady()) setPending(500, true);
        return ok([]);
      }
      if (t === 'unready') { ready[seat] = false; return ok([]); }
      if (ready[seat]) return fail('確定済みです（変更するには「やり直す」）');
      if (t === 'bet') {
        const amt = Math.trunc(Number(a.amt));
        if (!spec.valid(a.key)) return fail('そのベットはできません');
        if (!(amt >= 1) || amt > chips[seat]) return fail('チップが足りません');
        place(seat, a.key, amt);
        return ok([]);
      }
      if (t === 'clear') {
        for (const k of Object.keys(bets[seat])) chips[seat] += bets[seat][k];
        bets[seat] = {};
        return ok([]);
      }
      if (t === 'rebet') {
        if (!last[seat]) return fail('前回のベットがありません');
        for (const k of Object.keys(bets[seat])) chips[seat] += bets[seat][k];
        bets[seat] = {};
        let left = chips[seat];
        for (const [k, v] of Object.entries(last[seat])) { const x = Math.min(v, left); if (x > 0) { place(seat, k, x); left -= x; } }
        return ok([]);
      }
      return fail('不正な操作です');
    },

    resolve() {
      if (phase === 'bet') {
        phase = 'spin';
        for (let s = 0; s < n; s++) last[s] = total(s) ? { ...bets[s] } : last[s];
        outs = spec.shared ? Array(n).fill(spec.spin(rng, 0)) : Array.from({ length: n }, (_x, s) => spec.spin(rng, s));
        setPending(spec.spinMs, false);
        return ['ベット締め切り！'];
      }
      if (phase !== 'spin') { e.pending = 0; return []; }
      const logs = [];
      for (let s = 0; s < n; s++) {
        let p = 0;
        for (const [k, amt] of Object.entries(bets[s])) p += amt * spec.ret(k, outs[s]);
        paid[s] = p; chips[s] += p;
      }
      phase = 'done'; shown = outs; e.pending = 0; e.pendingVisible = false;
      history.push(spec.shared ? spec.describe(outs[0]) : null);
      if (spec.shared) logs.push(`結果: ${spec.describe(outs[0])}`);
      for (let s = 0; s < n; s++) {
        const b = total(s);
        if (!b) continue;
        const d = paid[s] - b;
        logs.push(`@${s}: ${spec.shared ? '' : spec.describe(outs[s]) + ' '}賭け${b} → 払戻${paid[s]}（${d >= 0 ? '+' : ''}${d}）`);
      }
      e.status = roundNo >= rounds || chips.every((c) => c <= 0) ? 'gameEnd' : 'roundEnd';
      return logs;
    },

    nextRound() { return startRound(); },
    cpu() { return { t: 'ready' }; },
    auto() { return { t: 'ready' }; },

    view(seat) {
      const g = {
        phase, roundNo, totalRounds: rounds, chips: [...chips], bets: bets.map((b) => ({ ...b })),
        ready: [...ready], betMs, spinMs: spec.spinMs, history: history.slice(-12),
        outcomes: shown, canRebet: seat >= 0 && !!last[seat], canBet: seat >= 0 && phase === 'bet' && !ready[seat] && chips[seat] > 0,
        paid: phase === 'done' ? [...paid] : null,
      };
      if (e.status === 'roundEnd' || e.status === 'gameEnd') {
        const rows = [];
        for (let s = 0; s < n; s++) {
          const b = total(s);
          if (!b) continue;
          const d = paid[s] - b;
          const cells = ['@' + s];
          if (!spec.shared) cells.push(spec.describe(outs[s]));
          cells.push(b, paid[s], (d >= 0 ? '+' : '') + d, chips[s]);
          rows.push({ cells, me: s === seat, gold: d > 0 });
        }
        const head = ['名前', ...(spec.shared ? [] : ['出目']), '賭け', '払戻', '増減', 'チップ'];
        if (e.status === 'roundEnd') {
          g.result = { title: `ラウンド${roundNo}の結果${spec.shared ? '：' + spec.describe(outs[0]) : ''}`, headers: head, rows, final: false };
        } else {
          const order = chips.map((c, s) => ({ s, c })).sort((a, b) => b.c - a.c);
          g.result = {
            title: '🏆 最終結果', headers: ['順位', '名前', 'チップ'], final: true,
            rows: order.map((o, i) => ({ cells: [1 + chips.filter((x) => x > o.c).length, '@' + o.s, o.c], me: o.s === seat, gold: i === 0 })),
          };
        }
      }
      return g;
    },
  });
  e.intro = startRound();
  return e;
}
