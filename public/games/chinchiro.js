// チンチロの画面
import { $, esc, nameOf, headerHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';
import { stop } from '/betting-ui.js';

export const banners = [['ピンゾロ', 'ピンゾロ！！'], ['ゾロ目', 'ゾロ目！'], ['シゴロ', 'シゴロ！'], ['ヒフミ', 'ヒフミ…']];
const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function render(root, v, api) {
  stop();
  const g = v.g;
  const cur = g.cur;
  const myTurn = v.phase === 'playing' && v.turn === v.you && v.turn >= 0;
  const text = myTurn ? `あなたの番です（${g.rolls + 1}回目／最大3回）` : cur >= 0 ? `${v.seats[cur].name} が振っています` : '';
  const list = g.order.map((s) => {
    const h = g.hands[s];
    const d = g.settled ? (s === g.parent ? -g.settled.reduce((a, r) => a + r.delta, 0) : g.settled.find((r) => r.s === s)?.delta ?? 0) : null;
    return `<div class="cp ${s === cur ? 'turn' : ''} ${s === v.you ? 'me' : ''}">
      <div class="n">${s === g.parent ? '👑 ' : ''}${esc(v.seats[s].name)}</div>
      <div class="c">🪙 ${g.chips[s]}</div>
      <div class="h ${h && h.strength < 0 ? 'bad' : h && h.strength >= 80 ? 'good' : ''}">${h ? esc(h.name) : s === cur ? '…' : '&nbsp;'}</div>
      ${d !== null ? `<div class="s"><b class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}">${d >= 0 ? '+' : ''}${d}</b></div>` : ''}</div>`;
  }).join('');
  const dice = g.dice || [null, null, null];
  root.innerHTML = headerHtml(v, `<span>第${g.roundNo}/${g.totalRounds}回　1人 ${g.stake}</span>`)
    + `<div class="tablebox casino"><div class="who">親：${nameOf(v, g.parent)}</div>
        <div class="dicebox ${g.dice ? 'tumble' : ''}" data-r="${g.rolls}">${dice.map((d) => `<span class="die">${d ? FACE[d] : '▫️'}</span>`).join('')}</div>
        <div class="dsum">${g.dice ? `${g.rolls}回目` : 'サイコロを振ろう'}</div></div>`
    + `<div class="cplayers">${list}</div>` + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="actions"><button class="btn primary big" id="roll" ${myTurn && !g.busy ? '' : 'disabled'}>🎲 サイコロを振る</button></div>
        <div class="hint">役: ピンゾロ(111)×5　ゾロ目×3　シゴロ(456)×2　目(2つ揃い+1つ)=その数　ヒフミ(123)=負け・倍払い　目なしは3回まで振り直し</div></div>`;
  bindCommon(api);
  const r = $('#roll');
  if (r) r.onclick = () => api.act({ t: 'roll' });
}

export function sfx(prev, v) {
  const a = prev?.g, b = v.g;
  if (b.dice && (!a || !a.dice || a.rolls !== b.rolls || a.cur !== b.cur)) return ['dice'];
  return [];
}
