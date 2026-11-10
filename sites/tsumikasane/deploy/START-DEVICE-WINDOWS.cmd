@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24をインストールしてください: https://nodejs.org/
  pause
  exit /b 1
)
echo ブラウザで http://127.0.0.1:4545 を開いてください。
node server.mjs
pause
