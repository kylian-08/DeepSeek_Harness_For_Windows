# DShHarness build: stage the app, generate the icon, then package with
# electron-builder (portable win-unpacked + NSIS setup.exe).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build.ps1
# Optional mirror env vars (set before running if GitHub is unreachable):
#   $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
#   $env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$ErrorActionPreference = "Stop"
# 项目根目录（build.ps1 位于 <root>\scripts\ 下）
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "== [1/3] stage application =="
& powershell -NoProfile -ExecutionPolicy Bypass -File "$Root\scripts\stage-app.ps1"
if ($LASTEXITCODE -ne 0) { throw "stage-app.ps1 failed (exit $LASTEXITCODE)" }

Write-Host "== [2/3] generate icon =="
node "$Root\scripts\gen-icon.js"
if ($LASTEXITCODE -ne 0) { throw "gen-icon.js failed" }

Write-Host "== [3/3] electron-builder --win --x64 =="
# Prefer the npmmirror mirror for the Electron binary when GitHub is slow/blocked.
if (-not $env:ELECTRON_MIRROR) {
    $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
}
& node "$Root\node_modules\electron-builder\out\cli\cli.js" --win --x64
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "== build finished =="
Get-ChildItem "$Root\dist" | Select-Object Name, @{N = "SizeMB"; E = { if ($_.PSIsContainer) { "{0:N1}" -f ((Get-ChildItem $_.FullName -Recurse -File | Measure-Object Length -Sum).Sum / 1MB) } else { "{0:N1}" -f ($_.Length / 1MB) } } } | Format-Table -AutoSize
