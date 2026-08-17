// DSH4Win — Electron shell for DeepSeek Harness (dsh) for Windows
//
// Boots the dsh web server with the bundled node.exe and loads its Web UI.
// The dsh process runs as a real node.exe child (not Electron's embedded
// Node) so native modules and node:sqlite behave exactly as in stock Node.
"use strict";

const { app, BrowserWindow } = require("electron");
const { spawn, execFile } = require("node:child_process");
const { existsSync, mkdirSync, appendFileSync, readFileSync, watchFile } = require("node:fs");
const { join } = require("node:path");
const net = require("node:net");
const http = require("node:http");
const os = require("node:os");

const APP_NAME = "DSH4Win";
const DEFAULT_PORT = 3080;
const READY_TIMEOUT_MS = 90_000;

// Icon styles selectable in the dsh settings page (壳外观), matching
// scripts/gen-icons.js. Stored by the @dshharness/shell plugin in
// <DSH_HOME>/storages/dshharness.json under { unit, global: { iconStyle } }.
const ICON_STYLES = [
  "blue-transparent",
  "black-transparent",
  "white-bg-black",
  "white-bg-blue",
  "blue-bg-white",
];
const DEFAULT_ICON_STYLE = "blue-transparent";

let mainWindow = null;
let dshProc = null;
let dshPort = DEFAULT_PORT;
let quitting = false;

// --- runtime layout -------------------------------------------------------

// Installed layout: <resources>/runtime/{node.exe, app/}
// Dev fallback: current node executable + project root.
function resolveRuntime() {
  const runtimeDir = join(process.resourcesPath, "runtime");
  const nodeExe = join(runtimeDir, "node.exe");
  const appDir = join(runtimeDir, "app");
  if (existsSync(nodeExe) && existsSync(appDir)) {
    return { nodeExe, appDir };
  }
  return { nodeExe: process.execPath, appDir: join(__dirname, "..") };
}

function dshBinJs(appDir) {
  return join(appDir, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
}

// --- first-launch agent presets (预装 windows增强 / flash增强) -------------
//
// Runs scripts/ensure-presets.js with the bundled node.exe BEFORE the dsh
// server starts, so the preset menu already offers our two presets on the
// very first launch. Idempotent: an installed preset is left untouched and
// the home default-preset patch is written at most once. Non-fatal — if the
// script fails for any reason the app still boots with stock presets.
function ensureBundledPresets() {
  const { nodeExe, appDir } = resolveRuntime();
  const installedRuntime = join(process.resourcesPath, "runtime");
  const installed = existsSync(join(installedRuntime, "ensure-presets.js"));
  const script = installed
    ? join(installedRuntime, "ensure-presets.js")
    : join(appDir, "scripts", "ensure-presets.js");
  const presetSource = installed
    ? join(installedRuntime, "presets")
    : join(appDir, "assets", "presets");

  if (!existsSync(script)) {
    log(`ensure-presets: script not found at ${script}; skipping`);
    return Promise.resolve();
  }

  log(`ensure-presets: running ${script} (source ${presetSource})`);
  return new Promise((resolve) => {
    const child = spawn(nodeExe, [script], {
      env: { ...process.env, DSH_PRESET_SOURCE: presetSource },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => {
      if (out.trim()) log("[ensure-presets] " + out.trimEnd().replace(/\n/g, " | "));
      if (code !== 0) log(`ensure-presets exited code=${code}`);
      resolve();
    });
    child.on("error", (err) => {
      log("ensure-presets spawn error: " + err.message);
      resolve();
    });
  });
}


function iconPath() {
  return join(__dirname, "..", "assets", "icon.ico");
}

// --- runtime icon switching (壳外观 setting) -------------------------------

// Installed layout: <resources>/runtime/icons/<style>/{icon.ico,...}
// Dev layout: <project>/assets/icons/<style>/
function resolveIconsDir() {
  const installed = join(process.resourcesPath, "runtime", "icons");
  if (existsSync(installed)) return installed;
  return join(__dirname, "..", "assets", "icons");
}

function dshHomeDir() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : join(os.homedir(), ".dsh");
}

// The @dshharness/shell plugin persists { unit, global: { iconStyle } } here.
function iconSettingFile() {
  return join(dshHomeDir(), "storages", "dshharness.json");
}

function readIconStyle() {
  try {
    const raw = readFileSync(iconSettingFile(), "utf8");
    const doc = JSON.parse(raw);
    // The @dshharness/shell plugin stores the style string directly in the
    // domain's global slot: { unit, global: "<style>", tables: {} }.
    const style = doc && typeof doc.global === "string" ? doc.global : undefined;
    return ICON_STYLES.includes(style) ? style : DEFAULT_ICON_STYLE;
  } catch {
    return DEFAULT_ICON_STYLE;
  }
}

function applyIconStyle(style) {
  if (!ICON_STYLES.includes(style)) style = DEFAULT_ICON_STYLE;
  const ico = join(resolveIconsDir(), style, "icon.ico");
  if (!existsSync(ico)) {
    log(`icon style "${style}" missing file ${ico}; keeping current`);
    return;
  }
  if (mainWindow) {
    mainWindow.setIcon(ico);
    log(`applied icon style: ${style}`);
  } else {
    log(`icon style queued: ${style}`);
  }
}

// Poll the persisted setting (watchFile uses stat polling, so it also
// catches the storage backend's atomic rename writes) and swap the window
// icon at runtime. Startup applies the persisted choice, then watches.
function watchIconSetting() {
  applyIconStyle(readIconStyle());
  const file = iconSettingFile();
  watchFile(file, { interval: 1000 }, () => {
    applyIconStyle(readIconStyle());
  });
  log(`watching icon setting: ${file}`);
}

// --- logging --------------------------------------------------------------

function log(msg) {
  try {
    const dir = app.getPath("logs");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "dsh.log"), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    /* logging must never break the app */
  }
}

// --- port helpers ---------------------------------------------------------

function isPortInUse(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: "127.0.0.1" });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => resolve(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolve(false); });
  });
}

function httpOk(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

function waitForHttp(port, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = async () => {
      if (await httpOk(port)) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

// --- dsh server -----------------------------------------------------------

function startDsh() {
  const { nodeExe, appDir } = resolveRuntime();
  const bin = dshBinJs(appDir);

  return (async () => {
    const portInUse = await isPortInUse(DEFAULT_PORT);
    const args = [bin, "web"];
    if (portInUse) {
      dshPort = 0; // ask the OS for a free port; we parse it from stdout
      args.push("--port", "0");
      log(`port ${DEFAULT_PORT} busy; requesting a random port`);
    }

    log(`spawning: ${nodeExe} ${args.join(" ")}`);
    const child = spawn(nodeExe, args, {
      cwd: app.getPath("home"),
      env: { ...process.env },
      windowsHide: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    dshProc = child;

    let stdoutBuf = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      log("[dsh] " + s.trimEnd());
      if (dshPort === 0) {
        stdoutBuf += s;
        const m = stdoutBuf.match(/127\.0\.0\.1:(\d+)/);
        if (m) dshPort = Number(m[1]);
      }
    });
    child.stderr.on("data", (d) => log("[dsh:err] " + d.toString().trimEnd()));
    child.on("exit", (code, sig) => {
      log(`[dsh] exited code=${code} sig=${sig}`);
      dshProc = null;
      if (!quitting) showErrorPage(`DeepSeek Harness 服务意外退出 (code ${code})`);
    });
    child.on("error", (err) => {
      log("[dsh] spawn error: " + err.message);
      if (!quitting) showErrorPage("无法启动 DeepSeek Harness 服务: " + err.message);
    });

    if (portInUse) {
      // Wait for the URL line that carries the actual port.
      const deadline = Date.now() + 60_000;
      while (dshPort === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const ready = await waitForHttp(dshPort, READY_TIMEOUT_MS);
    return { ready, url: `http://127.0.0.1:${dshPort}` };
  })();
}

// --- window ---------------------------------------------------------------

function showErrorPage(message) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Segoe UI,system-ui,sans-serif;background:#0b1020;color:#e8ecf5;
    display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .box{max-width:480px;text-align:center}.title{font-size:18px;font-weight:600;margin-bottom:8px}
    .msg{font-size:13px;color:#9aa7c7;word-break:break-all}</style></head>
    <body><div class="box"><div class="title">DSH4Win 启动失败</div>
    <div class="msg">${escapeHtml(message)}</div></div></body></html>`;
  loadWindow("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    title: APP_NAME,
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 关闭窗口 = 退出应用；before-quit 里会连带清理 dsh 子进程
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    showErrorPage(`页面加载失败 (${code} ${desc})`);
  });
}

function loadWindow(url) {
  if (!mainWindow) createWindow();
  mainWindow.loadURL(url);
  mainWindow.show();
}

function showWindow() {
  if (!mainWindow) createWindow();
  if (!mainWindow.webContents.getURL()) {
    loadWindow(`http://127.0.0.1:${dshPort}`);
  } else {
    mainWindow.show();
  }
}

// --- lifecycle ------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());

  app.whenReady().then(async () => {
    await ensureBundledPresets();
    const { ready, url } = await startDsh();
    log(`dsh ready=${ready} url=${url}`);
    createWindow();
    loadWindow(ready ? url : `http://127.0.0.1:${dshPort}`);
    watchIconSetting();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (dshProc) {
    try {
      execFile("taskkill", ["/pid", String(dshProc.pid), "/T", "/F"]);
    } catch {
      /* best effort */
    }
  }
});
