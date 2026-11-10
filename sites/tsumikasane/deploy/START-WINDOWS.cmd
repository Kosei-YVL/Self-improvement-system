@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24以上をインストールしてください: https://nodejs.org/
  pause
  exit /b 1
)
node setup-local.mjs
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo ブラウザで http://127.0.0.1:3000 を開いてください。
echo このウィンドウを開いている間、アプリを利用できます。
node --env-file=.env server.mjs
pause
