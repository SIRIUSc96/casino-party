// ヨットの画面
import { $, esc, headerHtml, logHtml, turnlineHtml, bindCommon } from '/ui.js';
import { stop } from '/betting-ui.js';

export const banners = [['ヨット！！', 'ヨット！！']];
const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function render(root, v, api) {
  stop();
  const g = v.g;
  const myTurn = v.phase === 'playing' && v.turn === v.you && v.turn >= 0;
  const cur = g.cur;
  const canHold = myTurn && g.dice && g.rolls > 0 && g.rolls < 3 && !g.busy;
  const text = myTurn
    ? (g.rolls === 0 ? 'あなたの番です。サイコロを振ってください' : g.rolls < 3 ? `キープする目を選んで振り直す（${g.rolls}/3回）か、欄を選んで記入` : '記入する欄を選んでください')
    : cur >= 0 ? `${v.seats[cur].name} の番です` : '';
  const dice = g.dice || [0, 0, 0, 0, 0];
  const dieHtml = dice.map((d, i) => `<button class="die yd ${g.held[i] ? 'held' : ''}" data-i="${i}" ${canHold ? '' : 'disabled'}>${d ? FACE[d] : '▫️'}</button>`).join('');
  const n = v.seats.length;
  const head = `<tr><th></th>${v.seats.map((s, i) => `<th class="${i === cur ? 'cur' : ''} ${i === v.you ? 'me' : ''}">${esc(s.name)}</th>`).join('')}</tr>`;
  const row = (c) => `<tr><th>${c.name}</th>${Array.from({ length: n }, (_x, s) => {
    const val = g.scores[s][c.id];
    if (val !== undefined) return `<td class="done">${val}</td>`;
    if (s === v.you && myTurn && g.preview && c.id in g.preview) return `<td class="pick" data-cat="${c.id}">${g.preview[c.id]}</td>`;
    return '<td></td>';
  }).join('')}</tr>`;
  const tail = `<tr class="sub"><th>ボーナス（${g.bonusLine}↑で+${g.bonus}）</th>${g.upper.map((u) => `<td>${u}/${g.bonusLine}${u >= g.bonusLine ? ' ✓' : ''}</td>`).join('')}</tr>`
    + `<tr class="tot"><th>合計</th>${g.totals.map((t) => `<td>${t}</td>`).join('')}</tr>`;
  root.innerHTML = headerHtml(v, `<span>第${g.roundNo}/${g.totalRounds}ラウンド</span>`)
    + `<div class="tablebox casino"><div class="dicebox ${g.busy ? 'tumble' : ''}" data-r="${g.rolls}">${dieHtml}</div>
        <div class="dsum">${g.dice ? `${g.rolls}/3回目　（光っている目がキープ）` : 'サイコロを振ろう'}</div></div>`
    + `<div class="ytable"><table>${head}${CATS_ROWS(g).map(row).join('')}${tail}</table></div>` + logHtml(v)
    + `<div class="me">${turnlineHtml(text, myTurn)}
        <div class="actions"><button class="btn primary big" id="roll" ${myTurn && !g.busy && g.rolls < 3 && !(g.rolls > 0 && g.held.every(Boolean)) ? '' : 'disabled'}>🎲 ${g.rolls === 0 ? 'サイコロを振る' : '残りを振り直す'}</button></div>
        <div class="hint">サイコロをタップでキープ。欄の数字をタップで記入。フルハウス=3+2 / フォーカード=同じ目4つ以上(合計点) / Sストレート=4連続15点 / Bストレート=5連続30点 / ヨット=5つ同じ50点</div></div>`;
  bindCommon(api);
  root.querySelectorAll('.yd').forEach((b) => { b.onclick = () => api.act({ t: 'hold', i: Number(b.dataset.i) }); });
  root.querySelectorAll('td.pick').forEach((td) => { td.onclick = () => api.act({ t: 'score', cat: td.dataset.cat }); });
  const r = $('#roll');
  if (r) r.onclick = () => api.act({ t: 'roll' });
}
const CATS_ROWS = (g) => g.cats;

export function sfx(prev, v) {
  const a = prev?.g, b = v.g;
  if (b.dice && b.busy && (!a || a.rolls !== b.rolls || a.cur !== b.cur)) return ['dice'];
  return [];
}
