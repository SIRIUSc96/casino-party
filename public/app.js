import { GAMES, GAME_IDS } from '/shared/games/index.js';
import { esc, nm, tickCountdown } from '/ui.js';
import * as daifugoUI from '/games/daifugo.js';
import * as sevensUI from '/games/sevens.js';
import * as babanukiUI from '/games/babanuki.js';
import * as shinkeiUI from '/games/shinkei.js';
import * as blackjackUI from '/games/blackjack.js';
import * as doubtUI from '/games/doubt.js';
import * as rouletteUI from '/games/roulette.js';
import * as sicboUI from '/games/sicbo.js';
import * as slotsUI from '/games/slots.js';
import * as chinchiroUI from '/games/chinchiro.js';
import { sfx } from '/sfx.js';
import { confetti } from '/celebrate.js';

const UI = { daifugo: daifugoUI, sevens: sevensUI, babanuki: babanukiUI, shinkei: shinkeiUI, blackjack: blackjackUI, doubt: doubtUI, roulette: rouletteUI, sicbo: sicboUI, slots: slotsUI, chinchiro: chinchiroUI };
const CATS = { card: '♠ トランプ', casino: '🎰 カジノ' };

const $ = (s) => document.querySelector(s);
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// 席の識別ID・参加中ルームはブラウザに保存（タブを閉じても同じ席に戻れる）
const ss = ls;
let token = ss.get('dfg_token');
if (!token) {
  token = (crypto.randomUUID ? crypto.randomUUID() : 't' + Math.random().toString(36).slice(2) + Date.now().toString(36));
  ss.set('dfg_token', token);
}

const socket = io();
let view = null;
let selected = new Set();
let lastLogKey = '';
let tick = null;
let inResult = false, resultHoldUntil = 0, holdTimer = null;

const params = new URLSearchParams(location.search);
const urlRoom = (params.get('room') || '').toUpperCase().slice(0, 4);
$('#name').value = ls.get('dfg_name') || '';
if (urlRoom) $('#code').value = urlRoom;
// 招待URL(?room=XXXX)で来た人は入室画面、それ以外は部屋作成画面だけを出す（入室は招待制）
if (urlRoom) {
  $('#btn-create').classList.add('hidden');
  $('.or').textContent = '招待されたルームに入ります';
  $('#code').readOnly = true;
} else {
  $('.or').classList.add('hidden');
  $('#home-msg').previousElementSibling.classList.add('hidden');
}

// ---------- 通信 ----------
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
const send = (ev, p) => new Promise((res) => socket.emit(ev, p, res));

socket.on('connect', () => {
  $('#conn').classList.add('hidden');
  const code = ss.get('dfg_room');
  if (code) {
    socket.emit('rejoin', { code, token }, (res) => {
      if (!res?.ok) { ss.del('dfg_room'); view = null; render(); }
    });
  }
});
socket.on('disconnect', () => $('#conn').classList.remove('hidden'));
socket.on('state', (v) => {
  const prev = view;
  view = v;
  ss.set('dfg_room', v.code);
  if (new URLSearchParams(location.search).get('room') !== v.code) history.replaceState(null, '', `?room=${v.code}`);
  render();
  playSounds(prev, v);
});
socket.on('kicked', ({ reason }) => {
  leaveLocal();
  toast(reason || '退出しました');
});

function leaveLocal() {
  ss.del('dfg_room');
  view = null;
  selected.clear();
  history.replaceState(null, '', location.pathname);
  render();
}

// ---------- ホーム ----------
function getName() {
  const n = $('#name').value.trim() || 'ユーザー';
  ls.set('dfg_name', n);
  return n;
}
$('#btn-create').onclick = async () => {
  const name = getName();
  if (!name) return;
  const res = await send('create', { name, token });
  if (!res?.ok) $('#home-msg').textContent = res?.error || '作成に失敗しました';
};
$('#btn-join').onclick = async () => {
  const name = getName();
  if (!name) return;
  const code = $('#code').value.trim().toUpperCase();
  if (code.length !== 4) { $('#home-msg').textContent = '招待コード（4文字）を入力してください'; return; }
  const res = await send('join', { code, name, token });
  if (!res?.ok) $('#home-msg').textContent = res?.error || '入室に失敗しました';
};
$('#code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });

// ---------- 描画（ゲームごとの画面は /games/*.js に分かれている）----------
const api = {
  act: async (a) => {
    const res = await send('act', { a });
    if (!res?.ok) toast(res?.error || '操作できません');
    return res;
  },
  toast,
  leave: () => {
    if (confirm('退出しますか？（ゲームは終了し、みんなロビーに戻ります）')) { socket.emit('leave'); leaveLocal(); }
  },
};

function render() {
  const screens = { home: $('#home'), lobby: $('#lobby'), game: $('#game') };
  let key = 'home';
  if (view) key = view.phase === 'lobby' ? 'lobby' : 'game';
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== key);
  if (key === 'lobby') renderLobby();
  if (key === 'game') renderGame();
  renderOverlay();
}

function inviteUrl() { return `${location.origin}/?room=${view.code}`; }

function renderLobby() {
  const v = view;
  const amHost = v.you === v.hostSeat;
  const meta = GAMES[v.game].meta;
  const st = v.settings;
  const pick = (id) => {
    const m = GAMES[id].meta;
    return `<button class="gpick ${id === v.game ? 'on' : ''}" data-game="${id}" ${amHost ? '' : 'disabled'}><b>${esc(m.name)}</b><small>${m.min === m.max ? m.min : `${m.min}〜${m.max}`}人</small></button>`;
  };
  const picker = Object.entries(CATS).map(([cat, label]) => {
    const ids = GAME_IDS.filter((id) => GAMES[id].meta.cat === cat);
    return ids.length ? `<div class="gcat">${label}</div><div class="gpicks">${ids.map(pick).join('')}</div>` : '';
  }).join('');
  const field = (f) => (f.type === 'bool'
    ? `<label><input type="checkbox" data-k="${f.k}" ${st[f.k] ? 'checked' : ''} ${amHost ? '' : 'disabled'}><span class="grow">${esc(f.label)} <small>${esc(f.hint || '')}</small></span></label>`
    : `<label><span class="grow">${esc(f.label)}</span><select data-k="${f.k}" ${amHost ? '' : 'disabled'}>${f.options.map(([val, t]) => `<option value="${val}" ${String(st[f.k]) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`);
  const enough = v.seats.length >= meta.min;
  $('#lobby').innerHTML = `
    <h1>ルーム <small>LOBBY</small></h1>
    <div class="invite">
      <div class="sub" style="margin:0">招待コード</div>
      <div class="code-big">${esc(v.code)}</div>
      <div class="url">${esc(inviteUrl())}</div>
      <div class="row">
        <button class="btn primary" id="copy">招待URLをコピー</button>
        ${navigator.share ? '<button class="btn" id="share">共有</button>' : ''}
      </div>
    </div>
    <h2>ゲーム${amHost ? '' : '（ホストが選びます）'}</h2>
    ${picker}
    <p class="gdesc">${esc(meta.desc)}</p>
    <h2>参加者（${v.seats.length}/${meta.max}）</h2>
    <ul class="plist">
      ${v.seats.map((s, i) => `<li>
        <span class="nm">${esc(s.name)}${i === v.you ? '（あなた）' : ''}</span>
        ${i === v.hostSeat ? '<span class="tag host">ホスト</span>' : ''}
        ${s.cpu ? '<span class="tag">CPU</span>' : ''}
        ${!s.connected ? '<span class="tag off">切断中</span>' : ''}
        ${amHost && i !== v.you ? `<button class="btn small danger" data-kick="${i}">外す</button>` : ''}
      </li>`).join('')}
    </ul>
    ${amHost ? `<div class="row" style="margin-top:8px"><button class="btn" id="addcpu" ${v.seats.length >= meta.max ? 'disabled' : ''}>＋ CPUを追加</button></div>` : ''}
    <h2>ルール${amHost ? '' : '（ホストが設定します）'}</h2>
    <div class="rules">${meta.schema.map(field).join('')}</div>
    <div style="margin-top:18px">
      ${amHost
        ? `<button class="btn primary big" id="start" ${enough ? '' : 'disabled'}>ゲーム開始</button>
           <p class="msg" style="color:var(--muted)">${enough ? '' : `あと${meta.min - v.seats.length}人必要です（CPUを追加できます）`}</p>`
        : '<p class="sub">ホストの開始を待っています…</p>'}
      <button class="btn small" id="leave" style="margin-top:8px">退室する</button>
    </div>`;
  $('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); toast('招待URLをコピーしました'); } catch { toast('コピーできませんでした。URLを手動でコピーしてください'); }
  };
  const sh = $('#share');
  if (sh) sh.onclick = () => navigator.share({ title: 'カジノゲーム集', text: `${meta.name}やろう！ 招待コード ${v.code}`, url: inviteUrl() }).catch(() => {});
  document.querySelectorAll('[data-game]').forEach((b) => {
    b.onclick = async () => { const res = await send('settings', { game: b.dataset.game }); if (!res?.ok) toast(res?.error || '変更できません'); };
  });
  document.querySelectorAll('#lobby [data-k]').forEach((el) => {
    el.onchange = () => socket.emit('settings', { settings: { [el.dataset.k]: el.type === 'checkbox' ? el.checked : Number(el.value) } });
  });
  document.querySelectorAll('[data-kick]').forEach((b) => { b.onclick = () => socket.emit('kick', { seat: Number(b.dataset.kick) }); });
  if ($('#addcpu')) $('#addcpu').onclick = () => socket.emit('addCpu');
  if ($('#start')) $('#start').onclick = async () => { const res = await send('start'); if (!res?.ok) toast(res?.error || '開始できません'); };
  $('#leave').onclick = () => { socket.emit('leave'); leaveLocal(); };
}

function renderGame() {
  UI[view.game].render($('#game'), view, api);
  announce();
  startTick();
  tickCountdown(view);
}

function startTick() {
  if (tick) return;
  tick = setInterval(() => { tickCountdown(view); updateOverlayTimer(); }, 500);
}

// 革命・ダウトなどの出来事を、ログの最新行から見つけて大きく表示
function announce() {
  const last = view.log[view.log.length - 1] || '';
  const key = view.code + view.log.length + last;
  if (key === lastLogKey) return;
  lastLogKey = key;
  const hit = (UI[view.game].banners || []).find(([k]) => last.includes(k));
  if (!hit) return;
  const b = $('#banner');
  sfx.play('banner');
  b.textContent = hit[1];
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

// ---------- 効果音 ----------
function playSounds(prev, v) {
  if (v.phase === 'lobby' || !prev || prev.code !== v.code || prev.game !== v.game || prev.phase === 'lobby') return;
  const names = [];
  const mine = v.you >= 0 && v.phase === 'playing' && v.turn === v.you && (prev.turn !== v.you || prev.phase !== 'playing');
  if (mine) names.push('ping');
  const own = UI[v.game].sfx ? UI[v.game].sfx(prev, v) : [];
  names.push(...own);
  if (!own.length && (v.logN || 0) > (prev.logN || 0) && v.phase === 'playing') names.push('card');
  if (prev.phase === 'playing' && (v.phase === 'roundEnd' || v.phase === 'gameEnd') && v.g?.result) {
    const row = v.g.result.rows.find((r) => r.me);
    if (v.phase === 'gameEnd') names.push(row?.gold ? 'fanfare' : 'lose');
    else if (row) names.push(row.gold ? 'win' : 'lose');
  }
  [...new Set(names)].forEach((n, i) => setTimeout(() => sfx.play(n), i * 120));
}
const muteBtn = $('#mute');
const paintMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
paintMute();
muteBtn.onclick = () => { sfx.toggle(); paintMute(); };
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.id === 'mute' || t.disabled) return;
  if (t.classList.contains('bcell')) sfx.play('chip');
  else if (!t.classList.contains('card')) sfx.play('click');
});

// ---------- 結果表示（ラウンド終了・ゲーム終了）----------
function updateOverlayTimer() {
  const el = $('#next-timer');
  if (el && view?.deadline) el.textContent = Math.max(0, Math.ceil((view.deadline - Date.now()) / 1000));
}

function renderOverlay() {
  const ov = $('#overlay');
  if (!view || (view.phase !== 'roundEnd' && view.phase !== 'gameEnd') || !view.g?.result) { ov.classList.add('hidden'); inResult = false; return; }
  const v = view;
  // 結果が出た直後は少し間をおいて余韻を楽しむ（勝った人には紙吹雪と「勝利！」）
  if (!inResult) {
    inResult = true;
    const row = v.g.result.rows.find((r) => r.me);
    const won = !!(row && row.gold);
    const final = !!v.g.result.final;
    resultHoldUntil = Date.now() + (won ? (final ? 3200 : 1800) : 900);
    if (won) {
      confetti(final);
      const b = $('#banner');
      b.textContent = final ? '🏆 優勝！' : '🎉 勝利！';
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    }
  }
  const wait = resultHoldUntil - Date.now();
  if (wait > 0) {
    ov.classList.add('hidden');
    clearTimeout(holdTimer);
    holdTimer = setTimeout(renderOverlay, wait);
    return;
  }
  const res = v.g.result;
  const amHost = v.you === v.hostSeat;
  const head = `<tr>${res.headers.map((h, i) => `<th class="${i === res.headers.length - 1 && res.headers.length > 3 ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr>`;
  const rows = res.rows.map((r) => `<tr class="${r.me ? 'meRow' : ''}">${r.cells.map((c) => `<td class="${r.gold ? 'gold' : ''}">${nm(c, v)}</td>`).join('')}</tr>`).join('');
  const foot = res.final
    ? `${amHost ? '<button class="btn primary big" id="tolobby">ロビーに戻る（もう一度遊ぶ）</button>' : '<p class="sub">ホストの操作を待っています…</p>'}
       <button class="btn small" id="leave2" style="margin-top:8px">退室する</button>`
    : `${amHost ? '<button class="btn primary big" id="next">次へ進む</button>' : ''}
       <p class="sub" style="text-align:center;margin-top:8px">自動で始まるまで <span id="next-timer"></span> 秒</p>`;
  ov.innerHTML = `<div class="modal"><h2>${esc(res.title)}</h2><table class="res">${head}${rows}</table><div style="margin-top:14px">${foot}</div></div>`;
  if ($('#next')) $('#next').onclick = () => socket.emit('nextRound');
  if ($('#tolobby')) $('#tolobby').onclick = () => socket.emit('toLobby');
  if ($('#leave2')) $('#leave2').onclick = () => { socket.emit('leave'); leaveLocal(); };
  ov.classList.remove('hidden');
  updateOverlayTimer();
}

render();
