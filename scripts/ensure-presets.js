// ensure-presets.js — first-launch agent-preset installer for DSH4Win.
//
// Copies the bundled agent presets (windows增强模式 / flash增强模式) into the
// dsh user-preset root (`<DSH_HOME>/.agent-presets/`), then writes a home-level
// patch that makes the first preset the UI default.
//
// dsh discovers user presets by directory: any folder under `~/.dsh/.agent-presets/`
// containing an `agent.cordis.yml` appears in the new-session preset menu
// (dsh-agent-presets includeUserRoot). No registration command exists — files
// are the registry. The home patch sets `agent-presets.config.default` so the
// first of our presets is pre-selected for new sessions; the launcher overlay
// preserves that field while overriding only `roots`.
//
// Idempotent: an already-installed preset directory is left untouched (its
// edits survive), and the patch is written at most once.

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

// --- preset sources (bundled, copied at build time) ------------------------

// Resolved explicitly by the caller (DSH_PRESET_SOURCE), never guessed:
// the desktop shell passes <resources>/runtime/presets, the web/CLI path
// relies on the dev default below. Falls back to the repo checkout layout
// so the script also works from a source clone.
function bundledPresetRoot(env = process.env) {
  const fromEnv = env.DSH_PRESET_SOURCE;
  if (fromEnv !== void 0 && fromEnv.trim().length > 0 && fs.existsSync(fromEnv)) return fromEnv;
  return path.join(__dirname, "..", "assets", "presets");
}

const DEFAULT_PRESET = "windows-enhanced";
const HOME_PATCH_FILE = "cordis.patch.yml"; // <DSH_HOME>/cordis.patch.yml

function homePatchEntries() {
  return [
    {
      id: "agent-presets",
      config: { default: DEFAULT_PRESET },
    },
  ];
}

function ensurePresets() {
  const home = resolveDshHome();
  const userRoot = path.join(home, ".agent-presets");
  const srcRoot = bundledPresetRoot();

  const presets = fs.existsSync(srcRoot)
    ? fs.readdirSync(srcRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(srcRoot, e.name, "agent.cordis.yml")))
        .map((e) => e.name)
        .sort()
    : [];

  if (presets.length === 0) {
    console.log("[ensure-presets] no bundled presets found under " + srcRoot + " — nothing to do");
    return;
  }

  fs.mkdirSync(userRoot, { recursive: true });

  let installed = 0;
  for (const id of presets) {
    const dst = path.join(userRoot, id);
    if (fs.existsSync(dst)) {
      console.log(`[ensure-presets] preset ${id} already installed at ${dst} — left untouched`);
      continue;
    }
    fs.cpSync(path.join(srcRoot, id), dst, { recursive: true });
    installed += 1;
    console.log(`[ensure-presets] installed preset ${id} -> ${dst}`);
  }

  // Home-level patch: default preset for new sessions. Only write when it
  // does not already exist — never clobber user edits.
  const patchFile = path.join(home, HOME_PATCH_FILE);
  if (!fs.existsSync(patchFile)) {
    fs.writeFileSync(
      patchFile,
      "# DSH4Win auto-generated: pre-installed agent presets.\n" +
        "# Sets the default preset for new sessions; edit freely (or delete to reset).\n" +
        JSON.stringify(homePatchEntries(), null, 2) +
        "\n",
      "utf8"
    );
    console.log(`[ensure-presets] wrote default-preset patch -> ${patchFile}`);
  }

  console.log(`[ensure-presets] done (${installed} new, ${presets.length} total bundled)`);
}

if (require.main === module) {
  try {
    ensurePresets();
  } catch (error) {
    console.error("[ensure-presets] failed: " + (error && error.stack ? error.stack : error));
    // Non-fatal: absence of presets must never block the app from starting.
    process.exitCode = 0;
  }
}

module.exports = { ensurePresets, resolveDshHome, bundledPresetRoot, homePatchEntries, DEFAULT_PRESET };
