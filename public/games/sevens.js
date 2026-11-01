// 7並べの画面
import * as C from '/shared/cards.js';
import { $, esc, nameOf, cardHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

let selected = null;
export const banners = [['あがり', 'あがり！'], ['失格', '失格！']];

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you;
  if (selected && !g.hand.some((c) => c.id === selected)) selected = null;
  const playable = new Set(g.playable);
  const mine = v.you >= 0 ? g.passesLeft[v.you] : null;
  const text = myTurn ? (g.playable.length ? 'あなたの番です（光っているカードが出せます）' : '出せるカードがありません。パスしてください') : `${v.seats[v.turn]?.name ?? ''} の番`;
  const table = C.SUITS.map((s, si) => `<div class="sv-row"><span class="sv-suit ${s === 'H' || s === 'D' ? 'red' : ''}">${C.SUIT_SYMBOL[s]}</span>${g.table[si].map((who, ri) => {
    const rank = ri + 1;
    if (who == null) return '<span class="sv-cell empty"></span>';
    return `<span class="sv-cell ${s === 'H' || s === 'D' ? 'red' : ''} ${who === -1 ? 'dead' : ''} ${rank === 7 ? 'seven' : ''}"><b>${C.STD_LABEL[rank]}</b></span>`;
  }).join('')}</div>`).join('');
  root.innerHTML = headerHtml(v)
    + chipsHtml(v, (i) => ({
      main: g.out[i] ? '<span class="bad">失格</span>' : g.place[i] ? `<span class="gold">${g.place[i]}位</span>` : `${g.counts[i]}<small>枚</small>`,
      sub: g.out[i] || g.place[i] || g.passesLeft[i] === null ? '' : `パスあと${g.passesLeft[i]}回`, cls: g.out[i] || g.place[i] ? 'done' : '',
    }))
    + `<div class="tablebox sv">${table}</div>` + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="hand" id="hand">${g.hand.map((c) => cardHtml(c, { sel: selected === c.id, cls: playable.has(c.id) ? 'ok' : 'dim' })).join('')}</div>
        <div class="actions"><button class="btn" id="pass" ${myTurn && !g.playable.length ? '' : 'disabled'}>パス${mine !== null && mine !== undefined ? `（あと${mine}回）` : ''}</button><button class="btn primary" id="play" ${myTurn && selected && playable.has(selected) ? '' : 'disabled'}>出す</button></div>
        <div class="hint" id="hint">${myTurn && g.playable.length ? 'カードをタップして選び、「出す」を押します' : ''}</div></div>`;
  bindCommon(api);
  $('#hand').onclick = (e) => {
    const b = e.target.closest('.card');
    if (!b) return;
    selected = selected === b.dataset.id ? null : b.dataset.id;
    render(root, v, api);
  };
  $('#pass').onclick = () => api.act({ t: 'pass' });
  $('#play').onclick = async () => { const r = await api.act({ t: 'play', id: selected }); if (r?.ok) selected = null; };
}
