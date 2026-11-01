// CPU同士の大量自動対戦で、ルールエンジンの不変条件を検証する
import * as R from '../shared/rules.js';

let seed = 12345;
const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rnd = (n) => Math.floor(rng() * n);

let games = 0, rounds = 0, turns = 0, revs = 0, cuts = 0;
for (let g = 0; g < 600; g++) {
  const n = 3 + rnd(4); // 3〜6人
  const rules = R.sanitizeRules({
    jokers: rnd(3), eight: rng() < 0.8, revolution: rng() < 0.8, lock: rng() < 0.7,
    sequence: rng() < 0.8, spe3: rng() < 0.7, miyakoochi: rng() < 0.4, back11: rng() < 0.4, skip5: rng() < 0.4,
    rounds: 3,
  });
  const game = R.newGame(n, rules);
  for (;;) {
    const r = R.startRound(game, rng);
    const total = r.total;
    let guard = 0;
    while (!r.over) {
      if (++guard > 5000) throw new Error('進行が終わらない ' + JSON.stringify(rules));
      const seat = r.turn;
      if (seat < 0 || r.hands[seat].length === 0) throw new Error('手番が不正');
      const choice = R.cpuChoose(r, seat, rng);
      const res = choice.pass ? R.pass(r, seat) : R.play(r, seat, choice.ids);
      if (!res.ok) throw new Error('CPUが不正な操作: ' + res.error + ' ' + JSON.stringify(choice));
      turns++;
      for (const e of res.events) { if (e.type === 'revolution') revs++; if (e.type === 'cut8') cuts++; }
      const inHands = r.hands.reduce((a, h) => a + h.length, 0);
      if (inHands + r.discarded !== total) throw new Error('カード枚数が合わない');
    }
    if (new Set(r.places).size !== n || r.places.length !== n) throw new Error('順位が不正');
    rounds++;
    if (R.finishRound(game, r)) break;
  }
  games++;
}
console.log(`OK games=${games} rounds=${rounds} turns=${turns} revolutions=${revs} cut8=${cuts}`);
