// ensure-ai-tools.js — first-launch installer for the @dshharness/ai-tools plugin.
//
// 1) Copies the plugin bundle into the web profile's node_modules and registers
//    it in `dsh.profile.bundles` (idempotent; an already-registered bundle and
//    an existing plugin directory are left untouched).
// 2) Migrates locally-configured credentials from the ZCode skills layout
//    (relay-ocr/config.json → relay; image-vision/api_key.txt → zhipu) into the
//    private dsh storage file <DSH_HOME>/storages/ai-tools.json — never into
//    the git repo. Idempotent: an existing storage value is never overwritten.
//
// Plugin resolution: the profile's package.json bundles are resolved from the
// profile node_modules (pnpm-style), which is reachable from
// <DSH_HOME>/profiles/web/node_modules; `dsh.profile.bundles` drives the patch
// stack at boot. The peer deps (@deepseek-ai/dsh-tools etc.) resolve through
// the shared junction at <DSH_HOME>/profiles/node_modules.

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// --- resolve harness home (mirror of @deepseek-ai/dsh-home-paths) ---------

function resolveDshHome(env = process.env) {
  const fromEnv = env.DSH_HOME;
  return path.resolve(
    fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : path.join(os.homedir(), ".dsh")
  );
}

// --- plugin source ---------------------------------------------------------

function pluginSource(env = process.env) {
  const fromEnv = env.DSH_AI_TOOLS_SOURCE;
  if (fromEnv !== void 0 && fromEnv.trim().length > 0 && fs.existsSync(fromEnv)) return fromEnv;
  return path.join(__dirname, "..", "plugins", "dshharness-ai-tools");
}

// --- helpers ---------------------------------------------------------------

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function storageFile(home) {
  return path.join(home, "storages", "ai_tools.json");
}

// --- step 1: register bundle -------------------------------------------------

function registerBundle(home, pluginDir) {
  const profileDir = path.join(home, "profiles", "web");
  const profilePkg = path.join(profileDir, "package.json");
  const nodeModulesDir = path.join(profileDir, "node_modules", "@dshharness");
  const pluginTarget = path.join(nodeModulesDir, "ai-tools");

  // copy plugin bundle if missing
  if (!fs.existsSync(pluginTarget)) {
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.cpSync(pluginDir, pluginTarget, { recursive: true });
    console.log(`[ensure-ai-tools] copied plugin -> ${pluginTarget}`);
  } else {
    console.log(`[ensure-ai-tools] plugin already present at ${pluginTarget} — left untouched`);
  }

  // register in profile package.json
  const pkg = readJson(profilePkg) || {
    name: "dsh-profile-web",
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: [] } },
  };
  pkg.dependencies = pkg.dependencies || {};
  pkg.dsh = pkg.dsh || {};
  pkg.dsh.profile = pkg.dsh.profile || {};
  pkg.dsh.profile.bundles = pkg.dsh.profile.bundles || [];

  let changed = false;
  if (!pkg.dependencies["@dshharness/ai-tools"]) {
    pkg.dependencies["@dshharness/ai-tools"] = "0.1.0";
    changed = true;
  }
  if (!pkg.dsh.profile.bundles.includes("@dshharness/ai-tools")) {
    pkg.dsh.profile.bundles.push("@dshharness/ai-tools");
    changed = true;
  }
  if (changed) {
    writeJson(profilePkg, pkg);
    console.log(`[ensure-ai-tools] registered bundle in ${profilePkg}`);
  } else {
    console.log("[ensure-ai-tools] bundle already registered — left untouched");
  }
}

// --- step 2: migrate credentials -------------------------------------------

function migrateCredentials(home) {
  const file = storageFile(home);
  const existing = readJson(file);
  const global = existing && typeof existing.global === "object" ? existing.global : {};
  const next = { ...global };

  let migrated = false;

  // relay: from ~/.agents/skills/relay-ocr/config.json
  const relaySrc = path.join(os.homedir(), ".agents", "skills", "relay-ocr", "config.json");
  const relayCfg = readJson(relaySrc);
  if (relayCfg && relayCfg.api_key && !(next.relay && next.relay.api_key)) {
    next.relay = {
      base_url: relayCfg.base_url || "https://www.zizidonghua.com/v1",
      api_key: relayCfg.api_key,
    };
    migrated = true;
    console.log("[ensure-ai-tools] migrated relay credentials from " + relaySrc);
  }

  // zhipu: from ~/.agents/skills/image-vision/api_key.txt
  const zhipuSrc = path.join(os.homedir(), ".agents", "skills", "image-vision", "api_key.txt");
  try {
    const key = fs.readFileSync(zhipuSrc, "utf8").trim();
    if (key && !(next.zhipu && next.zhipu.api_key)) {
      next.zhipu = { api_key: key };
      migrated = true;
      console.log("[ensure-ai-tools] migrated zhipu credentials from " + zhipuSrc);
    }
  } catch { /* missing — nothing to migrate */ }

  if (!migrated) {
    console.log("[ensure-ai-tools] credentials already present or none found — skipped");
    return;
  }

  writeJson(file, { unit: { name: "ai_tools", version: 1 }, global: next, tables: {} });
  console.log(`[ensure-ai-tools] wrote credentials -> ${file} (private, outside git)`);
}

function ensureAiTools() {
  const home = resolveDshHome();
  const src = pluginSource();
  if (!fs.existsSync(path.join(src, "package.json")) || !fs.existsSync(path.join(src, "lib", "index.js"))) {
    console.log(`[ensure-ai-tools] plugin source not found at ${src} — nothing to do`);
    return;
  }
  registerBundle(home, src);
  migrateCredentials(home);
  console.log("[ensure-ai-tools] done");
}

if (require.main === module) {
  try {
    ensureAiTools();
  } catch (error) {
    console.error("[ensure-ai-tools] failed: " + (error && error.stack ? error.stack : error));
    // Non-fatal: the app must still start without the plugin.
    process.exitCode = 0;
  }
}

module.exports = { ensureAiTools, resolveDshHome, pluginSource, registerBundle, migrateCredentials };
