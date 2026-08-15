// electron-builder afterPack hook: copy the staged dsh runtime
// (node.exe + app tree) into the packaged app's resources directory.
//
// This is done here instead of via `extraResources` because electron-builder
// drops `node_modules` when copying a directory tree with extraResources.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function afterPack(context) {
  const { appOutDir } = context;
  const src = path.join(__dirname, "..", "build", "runtime");
  const dest = path.join(appOutDir, "resources", "runtime");
  fs.cpSync(src, dest, { recursive: true });

  const sizeMB = (
    fs.readdirSync(dest, { recursive: true })
      .filter((p) => fs.statSync(path.join(dest, p)).isFile())
      .reduce((sum, p) => sum + fs.statSync(path.join(dest, p)).size, 0) / 1e6
  ).toFixed(1);
  console.log(`[after-pack] copied runtime -> ${dest} (${sizeMB} MB)`);
}

module.exports = afterPack;
