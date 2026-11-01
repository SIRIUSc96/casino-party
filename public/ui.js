// 各ゲームの画面で共通して使う部品
import * as R from '/shared/rules.js';
import * as C from '/shared/cards.js';
import { GAMES } from '/shared/games/index.js';

export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 文字列中の「@3」を3番の席の名前に置き換える（HTMLエスケープ済みで返す）
export const nm = (str, v) => esc(str).replace(/@(\d)/g, (_m, i) => esc(v.seats[Number(i)]?.name ?? ''));
export const nameOf = (v, i) => esc(v.seats[i]?.name ?? '');

// scheme: 'std'（A=1…K=13）/ 'dfg'（大富豪: 3が最弱、2が15）
export function cardHtml(c, { scheme = 'std', sel = false, id = true, cls = '', attrs = '' } = {}) {
  if (c.hidden) return backHtml(attrs, cls);
  const joker = c.suit === 'J';
  const red = c.suit === 'H' || c.suit === 'D';
  const rk = joker ? 'JOKER' : scheme === 'dfg' ? R.RANK_LABEL[c.rank] : C.STD_LABEL[c.rank];
  const st = joker ? '★' : C.SUIT_SYMBOL[c.suit];
  return `<button class="card ${red ? 'red' : ''} ${joker ? 'joker' : ''} ${sel ? 'sel' : ''} ${cls}" ${id ? `data-id="${c.id}"` : 'tabindex="-1"'} ${attrs}><span class="rk">${rk}</span><span class="st">${st}</span></button>`;
}
export const backHtml = (attrs = '', cls = '') => `<button class="card back ${cls}" ${attrs}></button>`;

export function headerHtml(v, extra = '') {
  const meta = GAMES[v.game].meta;
  return `<div class="gbar"><span>${esc(meta.name)}　ルーム ${esc(v.code)}</span><span class="grow"></span>${extra}<button class="btn small" id="leave">退出</button></div>`;
}

// 参加者の一覧チップ。fn(i) -> { main, sub, role, cls, turn }
export function chipsHtml(v, fn) {
  return `<div class="seats">${v.seats.map((s, i) => {
    const o = fn(i) || {};
    const turn = o.turn ?? (i === v.turn && v.phase === 'playing');
    return `<div class="chip ${turn ? 'turn' : ''} ${i === v.you ? 'me' : ''} ${o.cls || ''}">
      <div class="n">${esc(s.name)}${s.connected ? '' : ' 📴'}</div>
      <div class="c">${o.main ?? ''}</div>
      <div class="r">${o.role || '&nbsp;'}</div>
      <div class="pt">${o.sub || '&nbsp;'}</div></div>`;
  }).join('')}</div>`;
}

export const logHtml = (v) => `<div class="log">${v.log.slice(-4).map((l) => `<div>${esc(l)}</div>`).join('')}</div>`;

export const turnlineHtml = (text, mine) => `<div class="turnline ${mine ? 'mine' : ''}" id="turnline" data-text="${esc(text)}">${esc(text)}</div>`;

export function bindCommon(api) {
  const b = $('#leave');
  if (b) b.onclick = () => api.leave();
}

// 毎秒の更新: 手番表示の「残りN秒」と、data-countdown 要素
export function tickCountdown(v) {
  if (!v) return;
  const left = v.deadline ? Math.max(0, Math.ceil((v.deadline - Date.now()) / 1000)) : 0;
  const el = $('#turnline');
  if (el && v.phase === 'playing') el.textContent = el.dataset.text + (left > 0 && v.deadline ? `（残り${left}秒）` : '');
  document.querySelectorAll('[data-countdown]').forEach((x) => { x.textContent = left > 0 ? left : ''; });
}
