import test from 'node:test';
import assert from 'node:assert/strict';
import { spec as roulette } from '../shared/games/roulette.js';
import { spec as sicbo } from '../shared/games/sicbo.js';
import { SYMS, WEIGHT, slotRet, create as slots } from '../shared/games/slots.js';
import { judge, create as chinchiro } from '../shared/games/chinchiro.js';
import { scoreOf, create as yacht } from '../shared/games/yacht.js';
import { create as rouletteGame } from '../shared/games/roulette.js';

test('ルーレットの配当', () => {
  assert.equal(roulette.ret('n17', 17), 36);
  assert.equal(roulette.ret('n17', 18), 0);
  assert.equal(roulette.ret('red', 0), 0);
  assert.equal(roulette.ret('even', 0), 0);
  assert.equal(roulette.ret('red', 1), 2);
  assert.equal(roulette.ret('black', 2), 2);
  assert.equal(roulette.ret('d2', 13), 3);
  assert.equal(roulette.ret('low', 18), 2);
  assert.equal(roulette.ret('high', 18), 0);
  // 全37目での期待値: 赤黒などは 36/37 (2.7%の控除)
  let sum = 0;
  for (let o = 0; o <= 36; o++) sum += roulette.ret('red', o);
  assert.ok(Math.abs(sum / 37 - 36 / 37) < 1e-9);
});

test('大小の配当（ゾロ目は大小とも負け）', () => {
  const o = (...d) => ({ d });
  assert.equal(sicbo.ret('big', o(6, 5, 1)), 2);
  assert.equal(sicbo.ret('small', o(1, 2, 3)), 2);
  assert.equal(sicbo.ret('big', o(5, 5, 5)), 0);
  assert.equal(sicbo.ret('small', o(2, 2, 2)), 0);
  assert.equal(sicbo.ret('any3', o(4, 4, 4)), 31);
  assert.equal(sicbo.ret('s3', o(3, 3, 1)), 3);
  assert.equal(sicbo.ret('s3', o(1, 2, 4)), 0);
  assert.equal(sicbo.ret('t4', o(1, 1, 2)), 61);
  // 大の還元率は 約97.2%
  let t = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) t += sicbo.ret('big', o(a, b, c));
  assert.ok(Math.abs(t / 216 - 0.9722) < 0.001);
});

test('スロットの還元率は 90〜100%（遊べるがカジノ有利）', () => {
  let rtp = 0;
  for (const a of SYMS) for (const b of SYMS) for (const c of SYMS) rtp += WEIGHT[a] * WEIGHT[b] * WEIGHT[c] * slotRet([a, b, c]);
  assert.ok(rtp > 0.9 && rtp < 1.0, `RTP=${rtp}`);
  assert.equal(slotRet(['7', '7', '7']), 150);
  assert.equal(slotRet(['C', 'C', 'L']), 2);
  assert.equal(slotRet(['C', 'L', 'B']), 0);
});

test('チンチロの役の強さ', () => {
  assert.equal(judge([1, 1, 1]).name, 'ピンゾロ');
  assert.equal(judge([4, 6, 5]).name, 'シゴロ');
  assert.equal(judge([3, 1, 2]).name, 'ヒフミ');
  assert.equal(judge([2, 2, 5]).strength, 15);
  assert.equal(judge([5, 2, 2]).name, '目 5');
  assert.equal(judge([1, 3, 5]), null);
  assert.ok(judge([2, 2, 2]).strength > judge([4, 5, 6]).strength);
  assert.ok(judge([1, 1, 1]).strength > judge([6, 6, 6]).strength);
  assert.ok(judge([1, 2, 3]).strength < 0);
});

function seeded(seed) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test('チンチロはチップの合計が保存される', () => {
  for (let seed = 1; seed < 30; seed++) {
    const n = 2 + (seed % 5);
    const e = chinchiro(n, { bet: 100, laps: 2, chips: 200 }, { rng: seeded(seed) });
    let guard = 0;
    while (e.status !== 'gameEnd') {
      if (++guard > 5000) throw new Error('終わらない');
      if (e.status === 'roundEnd') { e.nextRound(); continue; }
      if (e.pending) e.resolve(); else assert.ok(e.act(e.turn, e.cpu(e.turn)).ok);
      const chips = e.view(0).chips;
      assert.equal(chips.reduce((a, b) => a + b, 0), 200 * n);
      assert.ok(chips.every((c) => c >= 0));
    }
  }
});

test('ルーレット: ベット締切までは出目が漏れず、精算でチップが正しく動く', () => {
  const e = rouletteGame(2, { rounds: 5, chips: 500, betTime: 20 }, { rng: seeded(7), isCpu: (s) => s === 1 });
  assert.equal(e.view(0).g?.outcomes ?? e.view(0).outcomes, null);
  assert.ok(!e.act(0, { t: 'bet', key: 'red', amt: 9999 }).ok); // 所持以上は不可
  assert.ok(e.act(0, { t: 'bet', key: 'n7', amt: 100 }).ok);
  assert.ok(e.act(0, { t: 'bet', key: 'red', amt: 50 }).ok);
  assert.equal(e.view(0).chips[0], 350);
  assert.ok(e.act(0, { t: 'clear' }).ok);
  assert.equal(e.view(0).chips[0], 500);
  assert.ok(e.act(0, { t: 'bet', key: 'red', amt: 100 }).ok);
  const seq = e.pendingSeq;
  assert.ok(e.act(0, { t: 'ready' }).ok); // 全員確定 → 受付を早める
  assert.notEqual(e.pendingSeq, seq);
  assert.ok(!e.act(0, { t: 'bet', key: 'red', amt: 1 }).ok); // 確定後は変更不可
  e.resolve(); // 締め切り → 抽選
  assert.equal(e.view(0).outcomes, null, '演出中は出目を見せない');
  assert.ok(!JSON.stringify(e.view(0)).includes('"result"'));
  e.resolve(); // 精算
  assert.ok(e.view(0).outcomes);
  const c = e.view(0).chips;
  assert.ok(c[0] === 400 || c[0] === 600);
});

test('スロットは席ごとに別の出目が出る', () => {
  const e = slots(3, { rounds: 5, chips: 500, betTime: 10 }, { rng: seeded(3), isCpu: () => true });
  e.resolve(); e.resolve();
  const o = e.view(0).outcomes;
  assert.equal(o.length, 3);
  assert.ok(o.every((x) => x.r.length === 3));
});

test('ヨットの得点計算', () => {
  assert.equal(scoreOf('n3', [3, 3, 1, 3, 6]), 9);
  assert.equal(scoreOf('choice', [1, 2, 3, 4, 6]), 16);
  assert.equal(scoreOf('four', [4, 4, 4, 4, 2]), 18);
  assert.equal(scoreOf('four', [4, 4, 4, 2, 2]), 0);
  assert.equal(scoreOf('full', [2, 2, 5, 5, 5]), 19);
  assert.equal(scoreOf('full', [2, 2, 2, 2, 2]), 0);
  assert.equal(scoreOf('small', [1, 2, 3, 4, 6]), 15);
  assert.equal(scoreOf('small', [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreOf('big', [2, 3, 4, 5, 6]), 30);
  assert.equal(scoreOf('big', [1, 2, 3, 4, 6]), 0);
  assert.equal(scoreOf('yacht', [6, 6, 6, 6, 6]), 50);
});

test('ヨット: 全員が12欄を埋めて終わり、他人の手番は操作できない', () => {
  const e = yacht(3, {}, { rng: seeded(5) });
  assert.ok(!e.act(1, { t: 'roll' }).ok);
  assert.ok(!e.act(0, { t: 'score', cat: 'n1' }).ok); // 振る前は記入不可
  let steps = 0;
  while (e.status !== 'gameEnd') {
    if (++steps > 5000) throw new Error('終わらない');
    if (e.pending) { e.resolve(); continue; }
    assert.ok(e.act(e.turn, e.cpu(e.turn)).ok);
  }
  const v = e.view(0);
  assert.equal(v.result.rows.length, 3);
  assert.ok(v.scores.every((s) => Object.keys(s).length === 12));
});
