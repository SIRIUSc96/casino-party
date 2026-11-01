// ルーレット・大小・スロット共通のベット画面
import { $, esc, headerHtml, logHtml, bindCommon } from '/ui.js';

const UNITS = [10, 50, 100, 500];
let unit = 10;

export const stakeOf = (v, key) => v.g.bets[v.you]?.[key] || 0;

// 盤面のマス。key=ベット種別、label=表示、win=結果表示時に当たりか
export function cell(v, key, label, cls = '', win = false) {
  const m = stakeOf(v, key);
  return `<button class="bcell ${cls} ${m ? 'has' : ''} ${win ? 'win' : ''}" data-key="${key}">${label}${m ? `<i class="stake">${m}</i>` : ''}</button>`;
}

function playersHtml(v) {
  const g = v.g;
  return `<div class="bplayers">${v.seats.map((s, i) => {
    const tot = Object.values(g.bets[i] || {}).reduce((a, b) => a + b, 0);
    const d = g.paid ? g.paid[i] - tot : null;
    return `<div class="bp ${i === v.you ? 'me' : ''}"><div class="n">${esc(s.name)}${g.phase === 'bet' && g.ready[i] ? ' ✅' : ''}</div>
      <div class="c">🪙 ${g.chips[i]}</div>
      <div class="s">${tot ? `賭け ${tot}` : '&nbsp;'}${d !== null && tot ? `<b class="${d > 0 ? 'plus' : d < 0 ? 'minus' : ''}"> ${d >= 0 ? '+' : ''}${d}</b>` : ''}</div></div>`;
  }).join('')}</div>`;
}

// o = { stage: HTML, board: HTML, help: 文字列 }
export function betScreen(root, v, api, o) {
  const g = v.g;
  const me = v.you;
  const myChips = me >= 0 ? g.chips[me] : 0;
  const iReady = me >= 0 && g.ready[me];
  const status = g.phase === 'bet'
    ? (iReady ? '確定しました。みんなを待っています…' : myChips > 0 ? 'マスをタップしてベット！' : 'チップがありません（見学中）')
    : g.phase === 'spin' ? '勝負！' : '結果';
  root.innerHTML = headerHtml(v, `<span>第${g.roundNo}/${g.totalRounds}回</span>`)
    + `<div class="tablebox casino">${o.stage}</div>`
    + playersHtml(v)
    + `<div class="board-wrap ${g.phase === 'bet' && !iReady && myChips > 0 ? '' : 'locked'}">${o.board}</div>`
    + `<div class="turnline ${g.phase === 'bet' && !iReady ? 'mine' : ''}">${esc(status)}${g.phase === 'bet' ? ' <span class="cd">残り<span data-countdown></span>秒</span>' : ''}</div>`
    + (g.phase === 'bet' && me >= 0 && myChips + Object.values(g.bets[me] || {}).reduce((a, b) => a + b, 0) > 0 ? `
      <div class="betbar">
        <div class="units">${UNITS.map((u) => `<button class="unit ${u === unit ? 'on' : ''}" data-unit="${u}">${u}</button>`).join('')}</div>
        <div class="actions">
          ${iReady
    ? '<button class="btn" id="unready">変更する</button>'
    : `<button class="btn" id="clear">やり直す</button><button class="btn" id="rebet" ${g.canRebet ? '' : 'disabled'}>前回と同じ</button><button class="btn primary" id="ready">確定</button>`}
        </div>
      </div>` : '')
    + `<div class="hint">${esc(o.help || '')}</div>` + logHtml(v);
  bindCommon(api);
  root.querySelectorAll('[data-key]').forEach((b) => {
    b.onclick = () => {
      if (!g.canBet) return;
      api.act({ t: 'bet', key: b.dataset.key, amt: Math.min(unit, myChips) });
    };
  });
  root.querySelectorAll('[data-unit]').forEach((b) => {
    b.onclick = () => { unit = Number(b.dataset.unit); root.querySelectorAll('[data-unit]').forEach((x) => x.classList.toggle('on', x === b)); };
  });
  for (const [id, t] of [['clear', 'clear'], ['rebet', 'rebet'], ['ready', 'ready'], ['unready', 'unready']]) {
    const el = $('#' + id);
    if (el) el.onclick = () => api.act({ t });
  }
}

// 演出中にくるくる変えるための小さな部品。次の描画で自動的に止まる
let timer = null;
export function animate(fn, ms) {
  stop();
  timer = setInterval(fn, ms);
}
export function stop() { if (timer) clearInterval(timer); timer = null; }
