// 1d1025ダイスの画面
import { $, esc, headerHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';
import { animate, stop } from '/betting-ui.js';

export const banners = [['最大値', '最大値！！'], ['最小値', '最小値…']];

export function render(root, v, api) {
  stop();
  const g = v.g;
  const cur = g.cur;
  const myTurn = v.phase === 'playing' && v.turn === v.you && v.turn >= 0;
  const text = myTurn ? 'あなたの番です。サイコロを振ってください' : cur >= 0 ? `${v.seats[cur].name} が振っています` : '';
  const done = g.values.filter((x) => x !== null);
  const max = done.length === g.values.length ? Math.max(...done) : null;
  const list = v.seats.map((s, i) => {
    const x = g.values[i];
    const shown = x !== null && !(g.busy && i === cur);
    return `<div class="cp ${i === cur ? 'turn' : ''} ${i === v.you ? 'me' : ''}">
      <div class="n">${esc(s.name)}</div>
      <div class="h ${max !== null && x === max ? 'good' : ''}">${shown ? x : i === cur ? '…' : '&nbsp;'}</div>
      <div class="s">${g.wins[i]}勝</div></div>`;
  }).join('');
  const hist = g.table.length
    ? `<div class="ytable"><table><tr><th>回</th>${v.seats.map((s) => `<th>${esc(s.name)}</th>`).join('')}</tr>${
      g.table.map((r, k) => { const m = Math.max(...r); return `<tr><th>${k + 1}</th>${r.map((x) => `<td class="${x === m ? 'done' : ''}">${x}</td>`).join('')}</tr>`; }).join('')
    }</table></div>`
    : '';
  const big = g.last !== null && !g.busy ? g.last : '…';
  root.innerHTML = headerHtml(v, `<span>第${g.roundNo}/${g.totalRounds}回　1〜${g.sides}</span>`)
    + `<div class="tablebox casino"><div class="dsum" style="font-size:56px;line-height:1.2" id="bignum">${g.busy ? '…' : max !== null ? max : big}</div>
        <div class="dsum">${g.busy ? '振っています…' : max !== null ? '最大値' : 'サイコロを振ろう'}</div></div>`
    + `<div class="cplayers">${list}</div>` + hist + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="actions"><button class="btn primary big" id="roll" ${myTurn && !g.busy ? '' : 'disabled'}>🎲 サイコロを振る</button></div>
        <div class="hint">全員が1回ずつ振って、いちばん大きい出目がそのラウンドの勝ち。同点は全員の勝ちになります</div></div>`;
  bindCommon(api);
  const r = $('#roll');
  if (r) r.onclick = () => api.act({ t: 'roll' });
  if (g.busy) {
    const el = $('#bignum');
    animate(() => { if (el) el.textContent = 1 + Math.floor(Math.random() * g.sides); }, 50);
  }
}

export function sfx(prev, v) {
  const a = prev?.g, b = v.g;
  if (b.busy && (!a || !a.busy)) return ['dice'];
  return [];
}
