// トランプ共通部品（大富豪以外のゲームで使う。A=1 … K=13、ジョーカーは rank 0 / suit 'J'）
export const SUITS = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣', J: '' };
export const STD_LABEL = { 0: 'JOKER', 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K' };

export const isRed = (c) => c.suit === 'H' || c.suit === 'D';
export const rankLabel = (r) => STD_LABEL[r];
export const stdLabel = (c) => (c.suit === 'J' ? 'JOKER' : SUIT_SYMBOL[c.suit] + STD_LABEL[c.rank]);

export function stdDeck(jokers = 0) {
  const d = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: s + r, suit: s, rank: r });
  for (let i = 1; i <= jokers; i++) d.push({ id: 'J' + i, suit: 'J', rank: 0 });
  return d;
}

export function shuffle(a, rng = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// マーク順→数字順（ジョーカーは最後）
export function sortStd(h) {
  const si = (c) => (c.suit === 'J' ? 9 : SUITS.indexOf(c.suit));
  return h.sort((a, b) => si(a) - si(b) || a.rank - b.rank);
}
// 数字順→マーク順（ジョーカーは最後）
export function sortRank(h) {
  const si = (c) => (c.suit === 'J' ? 9 : SUITS.indexOf(c.suit));
  return h.sort((a, b) => (a.rank || 99) - (b.rank || 99) || si(a) - si(b));
}
