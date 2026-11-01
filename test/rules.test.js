import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../shared/rules.js';

const C = (id) => {
  if (id[0] === 'J') return { id, suit: 'J', rank: 16 };
  return { id, suit: id[0], rank: Number(id.slice(1)) };
};
const rules = (o = {}) => R.sanitizeRules(o);

// 手札を直接指定したラウンドを作る
function mk(hands, o = {}, extra = {}) {
  const rs = rules(o);
  const r = {
    n: hands.length, rules: rs, hands: hands.map((h) => h.map(C)), turn: 0, field: null, lock: null,
    rev: false, back: false, owner: -1, finished: [], places: null, over: false, discarded: 0,
    total: 0, exchange: [], lastPlay: null, prevPlaces: null, ...extra,
  };
  return r;
}

test('単体の強弱: 3 < K < A < 2 < ジョーカー', () => {
  const r = mk([['S3', 'S13', 'S14', 'S15', 'J1'], ['H4', 'H5']]);
  assert.ok(R.play(r, 0, ['S13']).ok);
  assert.equal(R.play(r, 1, ['H4']).ok, false); // 弱い
  r.turn = 0;
  assert.ok(R.play(r, 0, ['S14']).ok);
});

test('8切りで場が流れ同じ人が続けて親', () => {
  const r = mk([['S8', 'S9', 'H3'], ['H4', 'H5'], ['D4', 'D6']]);
  const res = R.play(r, 0, ['S8']);
  assert.ok(res.ok);
  assert.ok(res.events.some((e) => e.type === 'cut8'));
  assert.equal(r.field, null);
  assert.equal(r.turn, 0);
});

test('8切りOFFなら流れない', () => {
  const r = mk([['S8', 'S9', 'H3'], ['H4', 'H5'], ['D4', 'D6']], { eight: false });
  R.play(r, 0, ['S8']);
  assert.ok(r.field);
  assert.equal(r.turn, 1);
});

test('全員パスで場が流れ、最後に出した人が親', () => {
  const r = mk([['S5', 'S9', 'H3'], ['H4', 'H6'], ['D4', 'D6']]);
  R.play(r, 0, ['S5']);
  assert.ok(R.pass(r, 1).ok);
  assert.ok(R.pass(r, 2).ok);
  assert.equal(r.field, null);
  assert.equal(r.turn, 0);
});

test('最初の手番ではパスできない', () => {
  const r = mk([['S5'], ['H4'], ['D4']]);
  assert.equal(R.pass(r, 0).ok, false);
});

test('同じ数字4枚で革命、強さが逆転', () => {
  const r = mk([['S5', 'H5', 'D5', 'C5', 'S9'], ['H3', 'D3', 'H12', 'H13'], ['D4', 'D6']]);
  const res = R.play(r, 0, ['S5', 'H5', 'D5', 'C5']);
  assert.ok(res.events.some((e) => e.type === 'revolution'));
  assert.equal(r.rev, true);
  r.field = null; r.lock = null; r.turn = 1; r.owner = -1;
  assert.ok(R.play(r, 1, ['H3']).ok); // 革命中は3が最強
  assert.equal(R.play(r, 2, ['D4']).ok, false); // 4は3より弱い
});

test('革命OFFなら4枚出しでも逆転しない', () => {
  const r = mk([['S5', 'H5', 'D5', 'C5', 'S9'], ['H3'], ['D4']], { revolution: false });
  R.play(r, 0, ['S5', 'H5', 'D5', 'C5']);
  assert.equal(r.rev, false);
});

test('縛り: 同じマークが続くとそのマークのみ', () => {
  const r = mk([['S5', 'S9', 'H3'], ['S6', 'H7', 'S10'], ['D4', 'D11']]);
  R.play(r, 0, ['S5']);
  R.play(r, 1, ['S6']); // 縛り成立
  assert.deepEqual(r.lock, ['S']);
  assert.equal(R.play(r, 2, ['D11']).ok, false); // ♦J はダメ
  r.turn = 0;
  assert.ok(R.play(r, 0, ['S9']).ok);
});

test('縛りOFFなら別マークも出せる', () => {
  const r = mk([['S5', 'S9', 'H3'], ['S6', 'H7'], ['D4', 'D11']], { lock: false });
  R.play(r, 0, ['S5']);
  R.play(r, 1, ['S6']);
  assert.equal(r.lock, null);
  assert.ok(R.play(r, 2, ['D11']).ok);
});

test('階段: 同マーク連続3枚以上、強さは先頭の数字', () => {
  const r = mk([['H3', 'H4', 'H5', 'S9'], ['S6', 'S7', 'S8', 'S3'], ['D4']], { eight: false });
  assert.equal(R.play(r, 0, ['H3', 'H5']).ok, false);
  assert.ok(R.play(r, 0, ['H3', 'H4', 'H5']).ok);
  assert.ok(R.play(r, 1, ['S6', 'S7', 'S8']).ok);
});

test('階段: 別マークや飛びはNG', () => {
  const r = mk([['H3', 'S4', 'H5', 'H7', 'H9'], ['H4']]);
  assert.equal(R.play(r, 0, ['H3', 'S4', 'H5']).ok, false);
  assert.equal(R.play(r, 0, ['H3', 'H5', 'H7']).ok, false);
});

test('ジョーカーはワイルドとして階段・ペアに使える', () => {
  const r = mk([['H3', 'H5', 'J1', 'S9'], ['D4']]);
  assert.ok(R.play(r, 0, ['H3', 'J1', 'H5']).ok);
  const r2 = mk([['H9', 'J1', 'S4'], ['D4', 'S10', 'C10']]);
  assert.ok(R.play(r2, 0, ['H9', 'J1']).ok);
  assert.ok(R.play(r2, 1, ['S10', 'C10']).ok);
});

test('スペ3返し: 単体ジョーカーにスペード3、場が流れる', () => {
  const r = mk([['J1', 'H4'], ['S3', 'D5'], ['C9']]);
  R.play(r, 0, ['J1']);
  const res = R.play(r, 1, ['S3']);
  assert.ok(res.ok);
  assert.ok(res.events.some((e) => e.type === 'spe3'));
  assert.equal(r.field, null);
  assert.equal(r.turn, 1);
});

test('スペ3返しOFF/他の3は不可', () => {
  const r = mk([['J1', 'H4'], ['H3', 'D5'], ['C9']]);
  R.play(r, 0, ['J1']);
  assert.equal(R.play(r, 1, ['H3']).ok, false);
  const r2 = mk([['J1', 'H4'], ['S3', 'D5'], ['C9']], { spe3: false });
  R.play(r2, 0, ['J1']);
  assert.equal(R.play(r2, 1, ['S3']).ok, false);
});

test('枚数が違う出し方は不可', () => {
  const r = mk([['S5', 'H5', 'S9'], ['H6', 'D6', 'H7'], ['D4']]);
  R.play(r, 0, ['S9']);
  assert.equal(R.play(r, 1, ['H6', 'D6']).ok, false);
});

test('あがりと順位・ラウンド終了、都落ち', () => {
  const r = mk([['S5'], ['H6', 'H9'], ['D7', 'D10']], { miyakoochi: true }, { prevPlaces: [1, 2, 0] });
  R.play(r, 0, ['S5']);
  assert.deepEqual(r.finished, [0]);
  R.play(r, 1, ['H6']);
  R.play(r, 2, ['D7']);
  const res = R.play(r, 1, ['H9']);
  assert.ok(res.roundOver);
  // 前回の大富豪(座席1)が1位でないので大貧民に転落
  assert.deepEqual(r.places, [0, 2, 1]);
});

test('11バック・5スキップ', () => {
  const r = mk([['S11', 'S9'], ['H4', 'H12'], ['D5', 'D13']], { back11: true });
  R.play(r, 0, ['S11']);
  assert.equal(r.back, true);
  assert.equal(R.play(r, 1, ['H12']).ok, false); // 逆転中はQがJより弱い
  const r2 = mk([['S5', 'S9'], ['H4', 'H12'], ['D5', 'D13']], { skip5: true });
  R.play(r2, 0, ['S5']);
  assert.equal(r2.turn, 2); // 1番がスキップされる
});

test('配札とカード交換（2ラウンド目）', () => {
  const g = R.newGame(4, { jokers: 2 });
  const r1 = R.startRound(g);
  assert.equal(r1.hands.flat().length, 54);
  assert.ok(r1.hands[r1.turn].some((c) => c.id === 'D3'));
  g.prevPlaces = [2, 0, 3, 1];
  const r2 = R.startRound(g);
  assert.equal(r2.exchange.length, 2);
  assert.equal(r2.turn, 1); // 大貧民から
  assert.equal(r2.hands.flat().length, 54);
});
