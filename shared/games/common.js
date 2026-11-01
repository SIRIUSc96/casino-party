// 各ゲーム共通の定義
export const TURN_TIME = {
  k: 'turnTime', type: 'select', label: '制限時間', def: 0,
  options: [[0, 'なし'], [20, '20秒'], [30, '30秒'], [60, '60秒']],
};
export const fail = (error) => ({ ok: false, error });
export const ok = (logs = []) => ({ ok: true, logs });

/*
 ゲームモジュールの共通インターフェース
   export const meta = { id, name, desc, min, max, schema:[{k,type:'bool'|'select',label,hint?,def,options?}] }
   export function create(n, settings, { rng, isCpu }) -> engine
 engine:
   status   'playing' | 'roundEnd' | 'gameEnd'
   turn     今操作すべき席（なければ -1）
   pending  >0 の間は操作を受け付けず、その ms 後にサーバーが resolve() を呼ぶ
   intro    開始時のログ
   act(seat, action) -> {ok, logs} | {ok:false, error}
   resolve() -> logs      pending 経過後の処理
   nextRound() -> logs    roundEnd の次へ
   cpu(seat) / auto(seat) -> action   CPUの手 / 時間切れ・離席時の手
   view(seat) -> その席に見せてよい情報だけ（相手の手札は含めない）
   hiddenIds(seat) -> その席に見せてはいけないカードid（テスト用）
 ログ中の「@3」は 3番の席の名前に置き換えられる
*/
