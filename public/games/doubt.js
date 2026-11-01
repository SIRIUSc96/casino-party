// ダウトの画面
import * as C from '/shared/cards.js';
import { $, esc, nameOf, cardHtml, backHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

let selected = new Set();
export const banners = [['ダウト！', 'ダウト！'], ['あがり', '勝利！']];

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you;
  selected = new Set([...selected].filter((id) => g.hand.some((c) => c.id === id)));
  const need = C.STD_LABEL[g.required];
  const text = g.window
    ? `${nameOf(v, g.last.seat)} が ${C.STD_LABEL[g.last.rank]} を${g.last.count}枚 出しました`
    : myTurn ? `あなたの番: 「${need}」と言って出します` : `${v.seats[v.turn]?.name ?? ''} の番`;
  const rv = g.reveal;
  const revealHtml = rv && !g.window
    ? `<div class="reveal ${rv.liar ? 'liar' : 'truth'}"><div>${nameOf(v, rv.caller)} のダウト → ${rv.liar ? '嘘でした！' : '本当でした…'}</div>
        <div class="field">${rv.cards.map((c) => cardHtml(c, { id: false, cls: 'mini' })).join('')}</div>
        <div class="who">${nameOf(v, rv.loser)} が山を引き取りました</div></div>` : '';
  const doubtBtn = g.canDoubt
    ? `<button class="btn doubt" id="doubt">ダウト！ <small data-countdown></small></button>`
    : '';
  root.innerHTML = headerHtml(v, `<span>次は「${need}」</span>`)
    + chipsHtml(v, (i) => ({
      main: g.out[i] ? '<span class="gold">勝ち</span>' : `${g.counts[i]}<small>枚</small>`,
      turn: g.window ? i === g.last.seat : i === v.turn, sub: g.window && i === g.last.seat ? '出した人' : '',
    }))
    + `<div class="tablebox"><div class="badges"><span class="badge">場の山 ${g.pileCount}枚</span><span class="badge rev">次は「${need}」</span></div>
        <div class="field">${g.pileCount ? Array.from({ length: Math.min(g.pileCount, 6) }, (_, i) => backHtml('tabindex="-1"', `stack s${i}`)).join('') : '<span class="empty">山札は空です</span>'}</div>
        ${revealHtml}
        ${g.window ? `<div class="who">嘘だと思ったら「ダウト！」 残り<b data-countdown></b>秒</div>` : ''}</div>`
    + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="hand" id="hand">${g.hand.map((c) => cardHtml(c, { sel: selected.has(c.id), cls: c.rank === g.required ? 'ok' : '' })).join('')}</div>
        <div class="actions">${doubtBtn}<button class="btn primary" id="play" ${myTurn && selected.size >= 1 && selected.size <= 4 ? '' : 'disabled'}>${selected.size ? `「${need}」を${selected.size}枚 出す` : '出す'}</button></div>
        <div class="hint">${myTurn ? '出すカードを1〜4枚選びます。「' + need + '」でなくてもOK（嘘をついてバレなければ勝ち）' : ''}</div></div>`;
  bindCommon(api);
  $('#hand').onclick = (e) => {
    const b = e.target.closest('.card');
    if (!b || !myTurn) return;
    const id = b.dataset.id;
    if (selected.has(id)) selected.delete(id);
    else if (selected.size < 4) selected.add(id);
    render(root, v, api);
  };
  $('#play').onclick = async () => { const r = await api.act({ t: 'play', ids: [...selected] }); if (r?.ok) selected.clear(); };
  if ($('#doubt')) $('#doubt').onclick = () => api.act({ t: 'doubt' });
}
