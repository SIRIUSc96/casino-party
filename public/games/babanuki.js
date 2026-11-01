// ババ抜きの画面
import { $, nm, nameOf, cardHtml, backHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

export const banners = [['あがり', 'あがり！'], ['ペア成立', 'ペア！']];

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you;
  const t = g.target;
  const text = myTurn ? `あなたの番: ${v.seats[t]?.name ?? ''} の手札から1枚引いてください` : v.turn >= 0 ? `${v.seats[v.turn].name} の番` : '';
  const targetBlock = v.phase === 'playing' && t >= 0
    ? `<div class="targethand"><div class="who">${nameOf(v, t)} の手札（${g.counts[t]}枚）${t === v.you ? '— あなたの手札から引かれます' : myTurn ? '— 引くカードをタップ' : ''}</div>
        <div class="hand">${Array.from({ length: g.counts[t] }, (_, i) => backHtml(`data-i="${i}" ${myTurn ? '' : 'disabled'}`, myTurn ? 'pick' : '')).join('')}</div></div>` : '';
  root.innerHTML = headerHtml(v)
    + chipsHtml(v, (i) => ({
      main: g.out[i] ? `<span class="gold">${g.out[i]}位</span>` : `${g.counts[i]}<small>枚</small>`,
      sub: i === t && v.phase === 'playing' ? '引かれる人' : '', cls: g.out[i] ? 'done' : '',
    }))
    + `<div class="tablebox"><div class="badges"><span class="badge dim">捨て札（ペア）</span></div>
        <div class="field">${g.discards.length ? g.discards.map((p) => `<span class="pairbox">${p.map((c) => cardHtml(c, { id: false, cls: 'mini' })).join('')}</span>`).join('') : '<span class="empty">まだありません</span>'}</div></div>`
    + targetBlock + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="who">あなたの手札（${g.hand.length}枚）</div>
        <div class="hand">${g.hand.map((c) => cardHtml(c, { id: false })).join('')}</div></div>`;
  bindCommon(api);
  document.querySelectorAll('.pick').forEach((b) => { b.onclick = () => api.act({ t: 'draw', i: Number(b.dataset.i) }); });
}
