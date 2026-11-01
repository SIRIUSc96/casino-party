// 大富豪ルールエンジン（サーバー/ブラウザ共通・DOM/通信に依存しない純粋なロジック）
// カード: { id:'S3', suit:'S|H|D|C|J', rank: 3..15(15='2', 14='A') | 16(ジョーカー) }

export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣', J: '' };
export const RANK_LABEL = {
  3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'JOKER',
};

export const DEFAULT_RULES = {
  jokers: 2,        // 0〜2
  eight: true,      // 8切り
  revolution: true, // 革命（同じ数字4枚以上）
  lock: true,       // 縛り
  sequence: true,   // 階段
  spe3: true,       // スペ3返し
  miyakoochi: false, // 都落ち
  back11: false,    // 11バック
  skip5: false,     // 5スキップ
  rounds: 3,        // ラウンド数
  turnTime: 0,      // 制限時間(秒) 0=なし
};

export function sanitizeRules(input = {}) {
  const r = { ...DEFAULT_RULES };
  for (const k of ['eight', 'revolution', 'lock', 'sequence', 'spe3', 'miyakoochi', 'back11', 'skip5']) {
    if (k in input) r[k] = !!input[k];
  }
  const num = (v, lo, hi, d) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  if ('jokers' in input) r.jokers = num(input.jokers, 0, 2, DEFAULT_RULES.jokers);
  if ('rounds' in input) r.rounds = num(input.rounds, 1, 10, DEFAULT_RULES.rounds);
  if ('turnTime' in input) r.turnTime = [0, 20, 30, 60].includes(Number(input.turnTime)) ? Number(input.turnTime) : 0;
  return r;
}

export function cardLabel(c) {
  return c.rank === 16 ? 'JOKER' : SUIT_SYMBOL[c.suit] + RANK_LABEL[c.rank];
}

export function makeDeck(jokers) {
  const d = [];
  for (const s of SUITS) for (let r = 3; r <= 15; r++) d.push({ id: s + r, suit: s, rank: r });
  for (let i = 1; i <= jokers; i++) d.push({ id: 'J' + i, suit: 'J', rank: 16 });
  return d;
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortHand(h) {
  return h.sort((a, b) => a.rank - b.rank || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

// 強さ（革命時は逆転。ジョーカーは常に最強）
export function strength(rank, rev) {
  if (rank === 16) return 100;
  return rev ? 18 - rank : rank;
}

// 役の解釈（ジョーカーはワイルド）。複数の解釈が成り立つことがある
export function analyze(cards, rules) {
  const n = cards.length;
  if (!n) return [];
  const jokers = cards.filter((c) => c.rank === 16).length;
  const nat = cards.filter((c) => c.rank !== 16);
  const suits = nat.map((c) => c.suit).sort();
  const out = [];
  if (n === 1) {
    out.push({ type: 'single', count: 1, rank: cards[0].rank, suits, jokers });
    return out;
  }
  const ranks = [...new Set(nat.map((c) => c.rank))];
  if (ranks.length <= 1) {
    out.push({ type: 'group', count: n, rank: ranks.length ? ranks[0] : 16, suits, jokers });
  }
  if (rules.sequence && n >= 3 && nat.length >= 1 && new Set(suits).size === 1 && ranks.length === nat.length) {
    const mn = Math.min(...ranks);
    const mx = Math.max(...ranks);
    if (mx - mn + 1 <= n) {
      for (let a = Math.max(3, mx - n + 1); a <= Math.min(mn, 15 - n + 1); a++) {
        out.push({ type: 'seq', count: n, rank: a, suits, jokers });
      }
    }
  }
  return out;
}

function isSpe3(it, prev) {
  return (
    prev && prev.type === 'single' && prev.rank === 16 &&
    it.type === 'single' && it.rank === 3 && it.suits[0] === 'S'
  );
}

function beats(it, f, rev, rules) {
  if (it.type !== f.type || it.count !== f.count) return false;
  if (rules.spe3 && isSpe3(it, f)) return true;
  return strength(it.rank, rev) > strength(f.rank, rev);
}

function lockOk(lock, it) {
  if (!lock) return true;
  const pool = [...lock];
  for (const s of it.suits) {
    const i = pool.indexOf(s);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ctx = { field:{interp}|null, lock:string[]|null, revEff:boolean, rules }
export function checkPlay(ctx, cards) {
  const its = analyze(cards, ctx.rules);
  if (!its.length) return { ok: false, reason: 'その組み合わせは出せません' };
  let best = null;
  let reason = '';
  for (const it of its) {
    if (ctx.field) {
      if (!beats(it, ctx.field.interp, ctx.revEff, ctx.rules)) {
        reason = '場のカードより強く、同じ形で出してください';
        continue;
      }
      if (ctx.lock && !lockOk(ctx.lock, it)) {
        reason = '縛り中です（同じマークのみ出せます）';
        continue;
      }
    }
    if (!best || strength(it.rank, ctx.revEff) > strength(best.rank, ctx.revEff)) best = it;
  }
  if (!best) return { ok: false, reason: reason || '出せません' };
  return { ok: true, interp: best };
}

export function ctxOf(r) {
  return { field: r.field, lock: r.lock, revEff: r.rev !== r.back, rules: r.rules };
}

// ---- 役名 ----
export function roleName(place, n) {
  if (place === 0) return '大富豪';
  if (place === n - 1) return '大貧民';
  if (n >= 4 && place === 1) return '富豪';
  if (n >= 4 && place === n - 2) return '貧民';
  return '平民';
}

// ---- ゲーム（複数ラウンド）----
export function newGame(n, rules) {
  return { n, rules: sanitizeRules(rules), scores: Array(n).fill(0), roundNo: 0, prevPlaces: null };
}

export function startRound(game, rng = Math.random) {
  const { n, rules } = game;
  const deck = shuffle(makeDeck(rules.jokers), rng);
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const total = deck.length;
  const exchange = [];
  if (game.prevPlaces) {
    const p = game.prevPlaces;
    const pairs = [[p[n - 1], p[0], 2]];
    if (n >= 4) pairs.push([p[n - 2], p[1], 1]);
    for (const [poor, rich, k] of pairs) {
      const byStrong = [...hands[poor]].sort((a, b) => strength(b.rank, false) - strength(a.rank, false));
      const give = byStrong.slice(0, k);
      const byWeak = [...hands[rich]].sort((a, b) => strength(a.rank, false) - strength(b.rank, false));
      const back = byWeak.slice(0, k);
      hands[poor] = hands[poor].filter((c) => !give.includes(c)).concat(back);
      hands[rich] = hands[rich].filter((c) => !back.includes(c)).concat(give);
      exchange.push({ poor, rich, up: give, down: back });
    }
  }
  hands.forEach(sortHand);
  let turn;
  if (game.prevPlaces) turn = game.prevPlaces[n - 1];
  else turn = hands.findIndex((h) => h.some((c) => c.id === 'D3'));
  return {
    n, rules, hands, turn, field: null, lock: null, rev: false, back: false,
    owner: -1, finished: [], places: null, over: false, discarded: 0, total,
    exchange, lastPlay: null, prevPlaces: game.prevPlaces,
  };
}

export function finishRound(game, r) {
  r.places.forEach((seat, i) => { game.scores[seat] += game.n - 1 - i; });
  game.roundNo++;
  game.prevPlaces = r.places;
  return game.roundNo >= game.rules.rounds;
}

const isActive = (r, s) => r.hands[s].length > 0;
const activeCount = (r) => r.hands.filter((h) => h.length > 0).length;

function advance(r, from) {
  let cleared = false;
  let s = from;
  for (let i = 0; i < r.n; i++) {
    s = (s + 1) % r.n;
    if (s === r.owner) cleared = true;
    if (isActive(r, s)) return { seat: s, cleared };
  }
  return { seat: from, cleared };
}

function clearField(r) {
  r.field = null;
  r.lock = null;
  r.back = false;
  r.owner = -1;
}

function endRound(r) {
  const rest = [];
  for (let s = 0; s < r.n; s++) if (isActive(r, s)) rest.push(s);
  let places = [...r.finished, ...rest];
  if (r.rules.miyakoochi && r.prevPlaces) {
    const d = r.prevPlaces[0];
    if (places[0] !== d) places = places.filter((s) => s !== d).concat(d);
  }
  r.places = places;
  r.over = true;
  r.turn = -1;
}

export function play(r, seat, ids) {
  const err = (error) => ({ ok: false, error });
  if (r.over) return err('ラウンドは終了しています');
  if (r.turn !== seat) return err('あなたの番ではありません');
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return err('カードを選んでください');
  const hand = r.hands[seat];
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return err('手札にないカードです');
  const chk = checkPlay(ctxOf(r), cards);
  if (!chk.ok) return err(chk.reason);

  const it = chk.interp;
  const prev = r.field;
  const events = [];
  r.hands[seat] = hand.filter((c) => !ids.includes(c.id));
  r.discarded += cards.length;
  r.field = { interp: it, cards, owner: seat };
  r.owner = seat;
  r.lastPlay = { seat, cards, interp: it };

  if (
    r.rules.lock && prev && !r.lock && it.suits.length && prev.interp.suits.length &&
    sameList(prev.interp.suits, it.suits)
  ) {
    r.lock = [...it.suits];
    events.push({ type: 'lock' });
  }
  if (r.rules.revolution && it.type === 'group' && it.count >= 4) {
    r.rev = !r.rev;
    events.push({ type: 'revolution', on: r.rev });
  }
  if (r.rules.back11 && cards.some((c) => c.rank === 11)) {
    r.back = !r.back;
    events.push({ type: 'back11' });
  }
  let cut = false;
  if (r.rules.spe3 && prev && isSpe3(it, prev.interp)) {
    cut = true;
    events.push({ type: 'spe3' });
  }
  if (r.rules.eight && cards.some((c) => c.rank === 8)) {
    cut = true;
    events.push({ type: 'cut8' });
  }
  const skipN = r.rules.skip5 ? cards.filter((c) => c.rank === 5).length : 0;

  let finishedNow = false;
  if (!r.hands[seat].length) {
    r.finished.push(seat);
    finishedNow = true;
    events.push({ type: 'finish', place: r.finished.length });
  }
  if (activeCount(r) <= 1) {
    endRound(r);
    return { ok: true, events, seat, cards, roundOver: true, finished: finishedNow };
  }
  if (cut) {
    clearField(r);
    r.turn = isActive(r, seat) ? seat : advance(r, seat).seat;
  } else {
    let a = advance(r, seat);
    if (a.cleared) {
      clearField(r);
    } else {
      for (let k = 0; k < skipN; k++) {
        const skipped = a.seat;
        a = advance(r, skipped);
        events.push({ type: 'skip', seat: skipped });
        if (a.cleared) {
          clearField(r);
          break;
        }
      }
    }
    r.turn = a.seat;
  }
  return { ok: true, events, seat, cards, roundOver: false, finished: finishedNow };
}

export function pass(r, seat) {
  const err = (error) => ({ ok: false, error });
  if (r.over) return err('ラウンドは終了しています');
  if (r.turn !== seat) return err('あなたの番ではありません');
  if (!r.field) return err('最初の手番ではパスできません');
  const a = advance(r, seat);
  if (a.cleared) clearField(r);
  r.turn = a.seat;
  return { ok: true, events: [], seat, pass: true };
}

// ---- 手の列挙（CPU・自動プレイ用）----
function combos(list, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i < list.length; i++) { cur.push(list[i]); rec(i + 1, cur); cur.pop(); }
  };
  rec(0, []);
  return out;
}

function candidates(hand, rules) {
  const jokers = hand.filter((c) => c.rank === 16);
  const nat = hand.filter((c) => c.rank !== 16);
  const res = [];
  for (const c of hand) res.push([c]);
  const byRank = new Map();
  for (const c of nat) {
    if (!byRank.has(c.rank)) byRank.set(c.rank, []);
    byRank.get(c.rank).push(c);
  }
  for (const list of byRank.values()) {
    for (let k = 1; k <= list.length; k++) {
      for (const sub of combos(list, k)) {
        for (let j = 0; j <= jokers.length; j++) {
          if (k + j >= 2) res.push([...sub, ...jokers.slice(0, j)]);
        }
      }
    }
  }
  if (jokers.length >= 2) res.push(jokers.slice(0, 2));
  if (rules.sequence) {
    for (const s of SUITS) {
      const m = new Map(nat.filter((c) => c.suit === s).map((c) => [c.rank, c]));
      for (let a = 3; a <= 13; a++) {
        for (let L = 3; a + L - 1 <= 15; L++) {
          const need = [];
          let missing = 0;
          for (let rk = a; rk < a + L; rk++) {
            const c = m.get(rk);
            if (c) need.push(c); else missing++;
          }
          if (need.length >= 1 && missing <= jokers.length) res.push([...need, ...jokers.slice(0, missing)]);
        }
      }
    }
  }
  return res;
}

export function legalMoves(r, seat) {
  const ctx = ctxOf(r);
  const out = [];
  for (const cs of candidates(r.hands[seat], r.rules)) {
    const chk = checkPlay(ctx, cs);
    if (chk.ok) out.push({ cards: cs, interp: chk.interp });
  }
  return out;
}

// CPUの思考（簡易）: 返り値 {pass:true} か {ids:[...]}
export function cpuChoose(r, seat, rng = Math.random) {
  const moves = legalMoves(r, seat);
  if (!moves.length) return { pass: true };
  const rev = r.rev !== r.back;
  const hand = r.hands[seat];
  const finisher = moves.find((m) => m.cards.length === hand.length);
  if (finisher) return { ids: finisher.cards.map((c) => c.id) };
  const leading = !r.field;
  const scored = moves.map((m) => {
    const s = strength(m.interp.rank, rev);
    const jokerUse = m.cards.filter((c) => c.rank === 16).length;
    let score = s + jokerUse * 10;
    if (leading) score -= m.cards.length * 2.5;
    if (m.interp.type === 'group' && m.interp.count >= 4) score += 6; // 革命は温存気味
    if (m.cards.some((c) => c.rank === 8)) score += leading ? 4 : -1;
    return { m, score, s };
  });
  scored.sort((a, b) => a.score - b.score);
  const pick = scored[0];
  if (!leading && hand.length > 3) {
    const othersClose = r.hands.some((h, i) => i !== seat && h.length > 0 && h.length <= 2);
    if (pick.s >= 14 && !othersClose && rng() < 0.5) return { pass: true };
  }
  return { ids: pick.m.cards.map((c) => c.id) };
}

// タイムアウト・切断時の自動操作
export function autoChoose(r, seat) {
  if (r.field) return { pass: true };
  const moves = legalMoves(r, seat);
  const rev = r.rev !== r.back;
  moves.sort((a, b) => strength(a.interp.rank, rev) - strength(b.interp.rank, rev) || b.cards.length - a.cards.length);
  return { ids: moves[0].cards.map((c) => c.id) };
}
