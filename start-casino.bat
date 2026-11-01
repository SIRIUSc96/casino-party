@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Daifugo Server (close this window to stop)

where node >nul 2>nul
if errorlevel 1 goto nonode

if not exist node_modules (
  echo 初回セットアップ中です。1分ほどお待ちください...
  call npm install
  if errorlevel 1 goto npmfail
)

node tools\launch.mjs
echo.
pause
exit /b

:nonode
echo Node.js が見つかりません。インストールします...
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo インストールが終わったら、このウィンドウを閉じて、もう一度 start-casino.bat をダブルクリックしてください。
echo （うまくいかない場合は https://nodejs.org から LTS をインストールしてください）
pause
exit /b

:npmfail
echo セットアップに失敗しました。インターネットに接続されているか確認してください。
pause
exit /b
