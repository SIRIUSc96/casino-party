#!/bin/bash
# Mac用: ダブルクリックで起動（初回のみ ターミナルで chmod +x start-casino.command が必要な場合あり）
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js が見つかりません。https://nodejs.org から LTS をインストールしてください。"; read -r -p "Enterで終了"; exit 1
fi
[ -d node_modules ] || npm install
node tools/launch.mjs
read -r -p "Enterで終了"
