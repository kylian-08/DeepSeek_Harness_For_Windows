@echo off
rem ============================================
rem  DShHarness - 一键启动 WebUI
rem  用法：双击本脚本即可
rem  启动后浏览器打开：http://127.0.0.1:3080
rem ============================================
setlocal

rem 切换到脚本所在目录（项目根目录）
cd /d "%~dp0"

rem 检查 Node.js / npx 是否安装
where npx >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+：
    echo        https://nodejs.org/
    echo        安装完成后重新双击本脚本。
    pause
    exit /b 1
)

rem 检查 3080 端口是否被占用（例如桌面版 DShHarness 正在运行）
netstat -ano | findstr ":3080" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo [提示] 端口 3080 已被占用，可能桌面版 DShHarness 正在运行。
    echo        请先关闭桌面版，再启动本脚本（WebUI 与桌面版共用端口）。
    pause
    exit /b 1
)

echo ============================================
echo  正在启动 DeepSeek Harness WebUI ...
echo  启动完成后请在浏览器打开：http://127.0.0.1:3080
echo  按 Ctrl+C 可停止服务。
echo ============================================
echo.
npx dsh web

echo.
echo 服务已停止。
pause
