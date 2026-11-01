// ワンクリック起動: ゲームサーバー起動 → 公開トンネル(cloudflared)作成 → 招待用URLを表示・コピー・ブラウザで開く
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.PORT) || 3000;
const isWin = process.platform === 'win32';
const binDir = path.join(root, 'bin');
const exeName = isWin ? 'cloudflared.exe' : 'cloudflared';
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

const say = (s = '') => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.on('uncaughtException', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    say(`\n[!] ポート${PORT}はすでに使われています。別のウィンドウでカジノゲーム集を起動中ではありませんか？`);
    say('    そのウィンドウを閉じてから、もう一度起動してください。');
  } else {
    say('\n[!] エラー: ' + (e && e.stack ? e.stack : e));
  }
  process.exit(1);
});

function findCloudflared() {
  const local = path.join(binDir, exeName);
  if (fs.existsSync(local)) return local;
  const r = spawnSync(isWin ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.split(/\r?\n/)[0].trim();
  if (isWin) {
    for (const p of ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe']) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function downloadCloudflared() {
  const url = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
  say('公開用ツール(cloudflared)を初回のみダウンロードします…（数十MB）');
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5e6) throw new Error('ダウンロードしたファイルが小さすぎます');
  fs.mkdirSync(binDir, { recursive: true });
  const dest = path.join(binDir, exeName);
  fs.writeFileSync(dest + '.part', buf);
  fs.renameSync(dest + '.part', dest);
  say('ダウンロード完了');
}

function copyToClipboard(text) {
  try {
    const cmd = isWin ? ['clip', []] : process.platform === 'darwin' ? ['pbcopy', []] : null;
    if (!cmd) return false;
    const p = spawn(cmd[0], cmd[1], { stdio: ['pipe', 'ignore', 'ignore'] });
    p.on('error', () => {});
    p.stdin.end(text);
    return true;
  } catch { return false; }
}

function openBrowser(url) {
  try {
    const p = isWin
      ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    p.on('error', () => {});
    p.unref();
  } catch { /* ignore */ }
}

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(`http://${i.address}:${PORT}`);
  }
  return out;
}

function banner(lines) {
  say('\n' + '='.repeat(60));
  for (const l of lines) say(l);
  say('='.repeat(60) + '\n');
}

await startServer({ port: PORT });
say(`カジノゲーム集サーバー起動しました（このPC: http://localhost:${PORT}）`);

function localOnlyGuide(reason) {
  const lan = lanUrls();
  banner([
    ' 友達用の公開URLは作れませんでした: ' + reason,
    ' 同じWi-Fi内の友達なら、次のURLで遊べます:',
    ...lan.map((u) => '   ' + u),
    ' 自分の画面: ' + `http://localhost:${PORT}`,
  ]);
  openBrowser(`http://localhost:${PORT}`);
}

let bin = findCloudflared();
if (!bin && isWin) {
  try { await downloadCloudflared(); bin = findCloudflared(); } catch (e) { say('[!] ダウンロードに失敗しました: ' + e.message); }
}
if (!bin) {
  localOnlyGuide(isWin ? 'cloudflaredを用意できませんでした' : 'cloudflaredが未インストールです（Macは brew install cloudflared）');
} else {
  say('友達用の公開URLを作っています…（最大1分ほど）');
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let found = false;
  const onData = (d) => {
    const m = String(d).match(TUNNEL_URL_RE);
    if (m && !found) { found = true; ready(m[0]); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (e) => localOnlyGuide('トンネルを起動できません: ' + e.message));
  child.on('exit', () => {
    if (!found) return localOnlyGuide('トンネルの作成に失敗しました（インターネット接続を確認してください）');
    say('\n[!] 公開トンネルが終了しました。友達は入れなくなります。再開するには、このウィンドウを閉じてもう一度起動してください。');
  });
  const bye = () => { try { child.kill(); } catch { /* ignore */ } process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
  process.on('exit', () => { try { child.kill(); } catch { /* ignore */ } });
  setTimeout(() => { if (!found) localOnlyGuide('時間内にトンネルが開通しませんでした'); }, 90000).unref();

  async function ready(url) {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(url + '/healthz'); if (r.ok) break; } catch { /* まだ開通前 */ }
      await sleep(1000);
    }
    const copied = copyToClipboard(url);
    banner([
      ' 準備できました！ ブラウザが開きます。',
      '',
      ' 1) 開いたページで「ルームを作る」を押す',
      ' 2) 表示される「招待URL」を友達に送る',
      '',
      ' 公開URL: ' + url + (copied ? '  （コピー済み）' : ''),
      '',
      ' ※このウィンドウを閉じるとゲームが止まります',
      ' ※起動し直すとURLが変わります',
    ]);
    openBrowser(url);
  }
}
