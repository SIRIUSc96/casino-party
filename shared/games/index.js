// ゲーム一覧（表示順）。新しいゲームを足すときは、ここに import して GAMES に加えるだけ
import * as daifugo from './daifugo.js';
import * as sevens from './sevens.js';
import * as babanuki from './babanuki.js';
import * as shinkei from './shinkei.js';
import * as blackjack from './blackjack.js';
import * as doubt from './doubt.js';
import * as roulette from './roulette.js';
import * as sicbo from './sicbo.js';
import * as slots from './slots.js';
import * as chinchiro from './chinchiro.js';
import * as yacht from './yacht.js';

export const GAMES = { daifugo, sevens, babanuki, shinkei, blackjack, doubt, roulette, sicbo, slots, chinchiro, yacht };
export const GAME_IDS = Object.keys(GAMES);

export const defaultsOf = (meta) => Object.fromEntries(meta.schema.map((f) => [f.k, f.def]));

// 設定を検証して整える（選択肢にない値は初期値に戻す）
export function sanitizeSettings(meta, input = {}) {
  const out = defaultsOf(meta);
  for (const f of meta.schema) {
    if (!(f.k in input)) continue;
    if (f.type === 'bool') out[f.k] = !!input[f.k];
    else {
      const o = f.options.find(([v]) => String(v) === String(input[f.k]));
      if (o) out[f.k] = o[0];
    }
  }
  return out;
}
