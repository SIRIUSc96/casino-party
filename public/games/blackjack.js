// ブラックジャックの画面
import { $, esc, nameOf, cardHtml, headerHtml, chipsHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';

export const banners = [['ブラックジャック', 'ブラックジャック！'], ['バスト', 'バスト！'], ['ダブルダウン', 'ダブルダウン！']];

const STATE = { play: 'プレイ中', stand: 'スタンド', bust: 'バスト', bj: 'ブラックジャック！', out: 'チップなし（見学）' };

export function render(root, v, api) {
  const g = v.g;
  const myTurn = v.phase === 'playing' && g.phase === 'players' && v.turn === v.you;
  const text = myTurn ? 'あなたの番です' : g.phase === 'dealer' ? 'ディーラーの番' : v.turn >= 0 ? `${v.seats[v.turn].name} の番` : '';
  const players = g.players.map((p, i) => {
    const o = p.outcome;
    const cls = p.state === 'bust' ? 'bust' : p.state === 'bj' ? 'bj' : '';
    return `<div class="bj-p ${i === v.you ? 'me' : ''} ${i === v.turn ? 'turn' : ''} ${cls}">
      <div class="bj-h"><b>${esc(v.seats[i].name)}</b><span class="tag">${STATE[p.state] ?? ''}</span><span class="grow"></span><small>賭け ${p.bet}${p.doubled ? '(×2)' : ''}　チップ ${p.chips}</small></div>
      <div class="bj-cards">${p.cards.map((c) => cardHtml(c, { id: false, cls: 'mini' })).join('') || '<span class="empty">—</span>'}
        ${p.cards.length ? `<span class="total ${p.total > 21 ? 'over' : ''}">${p.total}${p.soft && p.total <= 21 ? '<small>（ソフト）</small>' : ''}</span>` : ''}</div>
      ${o ? `<div class="bj-o ${o.delta > 0 ? 'win' : o.delta < 0 ? 'lose' : ''}">${o.text}　${o.delta >= 0 ? '+' : ''}${o.delta}</div>` : ''}</div>`;
  }).join('');
  root.innerHTML = headerHtml(v, `<span>第${g.roundNo}/${g.totalRounds}回　賭け金 ${g.bet}</span>`)
    + `<div class="tablebox bj"><div class="badges"><span class="badge dim">ディーラー</span></div>
        <div class="bj-cards">${g.dealer.cards.map((c) => cardHtml(c, { id: false })).join('')}${g.dealer.total !== null ? `<span class="total ${g.dealer.total > 21 ? 'over' : ''}">${g.dealer.total}</span>` : ''}</div>
        <div class="who">17以上になるまでヒットします</div></div>`
    + `<div class="bj-list">${players}</div>` + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="actions"><button class="btn" id="stand" ${myTurn ? '' : 'disabled'}>スタンド</button><button class="btn primary" id="hit" ${myTurn ? '' : 'disabled'}>ヒット</button><button class="btn" id="double" ${g.canDouble ? '' : 'disabled'}>ダブル</button></div>
        <div class="hint">ヒット=1枚引く　スタンド=そのまま勝負　ダブル=賭けを2倍にして1枚だけ引く</div></div>`;
  bindCommon(api);
  $('#hit').onclick = () => api.act({ t: 'hit' });
  $('#stand').onclick = () => api.act({ t: 'stand' });
  $('#double').onclick = () => api.act({ t: 'double' });
}
