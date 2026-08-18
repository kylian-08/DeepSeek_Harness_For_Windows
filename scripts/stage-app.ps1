# Stage a pruned copy of the dsh application into build/runtime/app,
# and copy the stock node.exe into build/runtime/node.exe.
#
# Usage: powershell -File scripts/stage-app.ps1 [-ProjectRoot <path>]
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$StageRoot = Join-Path $ProjectRoot "build"
$OutDir = Join-Path $StageRoot "runtime\app"
$NodeModulesSrc = Join-Path $ProjectRoot "node_modules"
$NodeModulesDst = Join-Path $OutDir "node_modules"

Write-Host "[stage] clean $StageRoot"
if (Test-Path $StageRoot) { Remove-Item -Recurse -Force $StageRoot }
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot "runtime") | Out-Null

# --- copy node_modules (robocopy; exit codes 0-7 are success) ---
Write-Host "[stage] copying node_modules -> $NodeModulesDst"
& robocopy $NodeModulesSrc $NodeModulesDst /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
$script:LASTEXITCODE = 0

# --- prune dev-only packages (build toolchain: electron, electron-builder, ...) ---
# Compute the set difference between the full dependency tree and the
# production tree (npm ls --omit=dev), then delete the dev-only package
# directories from the staged copy. Their absence cannot break the runtime
# tree because npm resolved production deps without them.
Write-Host "[stage] pruning dev-only packages"
Push-Location $ProjectRoot
try {
    $all = & npm ls --parseable --all 2>$null | Where-Object { $_ }
    $prod = & npm ls --omit=dev --parseable --all 2>$null | Where-Object { $_ }
} finally {
    Pop-Location
}
$devOnly = @($all | Where-Object { $_ -and ($prod -notcontains $_) })
foreach ($p in $devOnly) {
    $norm = $p.Replace('/', '\').TrimEnd('\')
    $parent = Split-Path -Parent $norm
    if ($parent -ne $NodeModulesSrc) { continue }   # only top-level/scope dirs
    $leaf = Split-Path -Leaf $norm
    $target = Join-Path $NodeModulesDst $leaf
    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue
    }
}

Copy-Item (Join-Path $ProjectRoot "package.json") (Join-Path $OutDir "package.json")
if (Test-Path (Join-Path $ProjectRoot "package-lock.json")) {
    Copy-Item (Join-Path $ProjectRoot "package-lock.json") (Join-Path $OutDir "package-lock.json")
}

# --- copy node.exe ---
$NodeExe = Join-Path $StageRoot "runtime\node.exe"
$NodeSrc = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path $NodeSrc)) { throw "node.exe not found at $NodeSrc" }
Write-Host "[stage] copying node.exe"
Copy-Item $NodeSrc $NodeExe

# --- copy first-launch preset installer + bundled agent presets ---
# The desktop shell runs ensure-presets.js with the bundled node.exe on
# startup; it copies these presets into <DSH_HOME>/.agent-presets/ (idempotent).
$EnsureScript = Join-Path $ProjectRoot "scripts\ensure-presets.js"
if (Test-Path $EnsureScript) {
    Copy-Item $EnsureScript (Join-Path $StageRoot "runtime\ensure-presets.js")
    Write-Host "[stage] copied ensure-presets.js -> runtime"
}
$PresetsSrc = Join-Path $ProjectRoot "assets\presets"
$PresetsDst = Join-Path $StageRoot "runtime\presets"
if (Test-Path $PresetsSrc) {
    Copy-Item -Recurse $PresetsSrc $PresetsDst
    Write-Host "[stage] copied presets -> runtime\presets"
}

# --- copy AI sidecar tools installer + plugin bundle (first-launch) ---
# ensure-ai-tools.js registers @dshharness/ai-tools into the web profile and
# migrates locally-configured API keys into private storage on first launch.
$EnsureAiTools = Join-Path $ProjectRoot "scripts\ensure-ai-tools.js"
if (Test-Path $EnsureAiTools) {
    Copy-Item $EnsureAiTools (Join-Path $StageRoot "runtime\ensure-ai-tools.js")
    Write-Host "[stage] copied ensure-ai-tools.js -> runtime"
}
$PluginSrc = Join-Path $ProjectRoot "plugins\dshharness-ai-tools"
$PluginDst = Join-Path $StageRoot "runtime\plugins\dshharness-ai-tools"
if (Test-Path $PluginSrc) {
    New-Item -ItemType Directory -Force -Path (Split-Path $PluginDst) | Out-Null
    Copy-Item -Recurse $PluginSrc $PluginDst
    Write-Host "[stage] copied ai-tools plugin -> runtime\plugins\dshharness-ai-tools"
}

# --- copy switchable icon styles (window/tray icon at runtime) ---
$IconsSrc = Join-Path $ProjectRoot "assets\icons"
$IconsDst = Join-Path $StageRoot "runtime\icons"
if (Test-Path $IconsSrc) {
    Write-Host "[stage] copying icon styles -> runtime\icons"
    Copy-Item -Recurse $IconsSrc $IconsDst
}

# --- prune debug / non-windows artifacts ---
Write-Host "[stage] pruning .pdb debug files"
Get-ChildItem -Path $NodeModulesDst -Recurse -Filter *.pdb -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[stage] pruning non-windows node-pty prebuilds"
$PtyPrebuilds = Join-Path $NodeModulesDst "node-pty\prebuilds"
if (Test-Path $PtyPrebuilds) {
    Get-ChildItem $PtyPrebuilds -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne "win32-x64" } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[stage] pruning source maps and markdown docs"
Get-ChildItem -Path $NodeModulesDst -Recurse -Filter *.map -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $NodeModulesDst -Recurse -Filter *.md -File -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# --- report ---
$Size = (Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("[stage] done. app size: {0:N1} MB" -f ($Size / 1MB))
