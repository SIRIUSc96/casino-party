// 大富豪の画面
import * as R from '/shared/rules.js';
import { $, esc, nm, nameOf, cardHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

let selected = new Set();
export const banners = [['革命', '革命！'], ['スペ3返し', 'スペ3返し！'], ['8切り', '8切り！'], ['縛り', '縛り！'], ['11バック', '11バック！'], ['スキップ', 'スキップ！'], ['あがり', 'あがり！']];

const typeName = (it) => ({ single: '単体', group: `${it.count}枚組`, seq: `${it.count}枚階段` }[it.type]);
const ctxOf = (g) => ({ field: g.field, lock: g.lock, revEff: g.rev !== g.back, rules: g.rules });

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you;
  selected = new Set([...selected].filter((id) => g.hand.some((c) => c.id === id)));
  const badges = [];
  if (g.rev) badges.push('<span class="badge rev">革命中</span>');
  if (g.back) badges.push('<span class="badge rev">11バック中</span>');
  if (g.lock) badges.push(`<span class="badge">縛り ${g.lock.map((s) => R.SUIT_SYMBOL[s]).join('')}</span>`);
  if (g.field) badges.push(`<span class="badge dim">${typeName(g.field.interp)}</span>`);

  let note = '';
  if (g.exchange) {
    const e = g.exchange.find((x) => x.poor === v.you || x.rich === v.you);
    if (e) {
      const give = e.poor === v.you ? e.up : e.down;
      const get = e.poor === v.you ? e.down : e.up;
      note = `<div class="note">カード交換: ${give.map(R.cardLabel).join(' ')} を渡し、${get.map(R.cardLabel).join(' ')} を受け取りました</div>`;
    }
  }
  const text = myTurn ? 'あなたの番です' : `${v.seats[v.turn]?.name ?? ''} の番`;
  root.innerHTML = headerHtml(v, `<span>ラウンド ${Math.min(g.roundNo, g.totalRounds)}/${g.totalRounds}</span>`)
    + chipsHtml(v, (i) => {
      const s = g.seats[i];
      return { main: s.count === 0 ? `<span class="gold">${s.place}位</span>` : `${s.count}<small>枚</small>`, role: s.role ? esc(s.role) : '', sub: `${s.score}pt`, cls: s.count === 0 ? 'done' : '' };
    })
    + `<div class="tablebox"><div class="badges">${badges.join('')}</div>
        <div class="field">${g.field ? g.field.cards.map((c) => cardHtml(c, { scheme: 'dfg', id: false })).join('') : `<span class="empty">${v.turn >= 0 ? `${nameOf(v, v.turn)}が親です。好きなカードから出せます` : '場は空です'}</span>`}</div>
        <div class="who">${g.field ? `${nameOf(v, g.field.owner)} が出したカード` : ''}</div></div>`
    + logHtml(v) + note
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="hand" id="hand">${g.hand.map((c) => cardHtml(c, { scheme: 'dfg', sel: selected.has(c.id) })).join('')}</div>
        <div class="actions"><button class="btn" id="pass" ${myTurn && g.field ? '' : 'disabled'}>パス</button><button class="btn primary" id="play" disabled>出す</button></div>
        <div class="hint" id="hint"></div></div>`;
  bindCommon(api);
  $('#hand').onclick = (e) => {
    const b = e.target.closest('.card');
    if (!b) return;
    const id = b.dataset.id;
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    b.classList.toggle('sel');
    update(v);
  };
  $('#pass').onclick = async () => { await api.act({ t: 'pass' }); selected.clear(); };
  $('#play').onclick = async () => { const r = await api.act({ t: 'play', ids: [...selected] }); if (r?.ok) selected.clear(); };
  update(v);
}

function update(v) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you;
  const hint = $('#hint'), play = $('#play');
  if (!hint || !play) return;
  hint.className = 'hint';
  if (!myTurn || !selected.size) {
    play.disabled = true;
    hint.textContent = myTurn ? 'カードをタップして選び、「出す」を押します' : '';
    return;
  }
  const chk = R.checkPlay(ctxOf(g), g.hand.filter((c) => selected.has(c.id)));
  play.disabled = !chk.ok;
  if (chk.ok) { hint.textContent = `${typeName(chk.interp)}で出せます`; hint.classList.add('good'); }
  else { hint.textContent = chk.reason; hint.classList.add('bad'); }
}
