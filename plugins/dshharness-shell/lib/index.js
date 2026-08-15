// DShHarness shell-appearance plugin — server half.
//
// Persists the chosen icon style in a dedicated storage domain
// (`~/.dsh/storages/dshharness.json`) and exposes a small HTTP API
// (`/dshharness/api/icon-style`) that the client settings page calls.
// The packaged Electron app watches the storage file and swaps the
// window icon at runtime.
import { z } from "zod";

export const name = "@dshharness/shell";

export const inject = ["webServer", "storage"];

const API_PREFIX = "/dshharness/api";

const ICON_STYLES = [
  "blue-transparent",
  "black-transparent",
  "white-bg-black",
  "white-bg-blue",
  "blue-bg-white",
];

const DOMAIN_NAME = "dshharness";

function isIconStyle(v) {
  return typeof v === "string" && ICON_STYLES.includes(v);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => {
      chunks += c;
      if (chunks.length > 64 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(chunks));
    req.on("error", reject);
  });
}

export function apply(ctx) {
  const domainPromise = ctx.storage.domain.open({
    name: DOMAIN_NAME,
    version: 1,
    tables: {},
    global: {
      schema: z.string(),
      initial: "blue-transparent",
    },
  });

  ctx.effect(() => {
    const disposers = [];

    const register = async () => {
      const domain = await domainPromise;
      const pathFor = (url = "/") =>
        new URL(url, "http://localhost").pathname
          .replace(new RegExp(`^${API_PREFIX}`), "") || "/";

      disposers.push(
        ctx.webServer.register({
          kind: "prefix",
          path: API_PREFIX,
          handler: async (req, res) => {
            const send = (code, obj) => {
              res.writeHead(code, {
                "content-type": "application/json; charset=utf-8",
              });
              res.end(JSON.stringify(obj));
            };
            try {
              const path = pathFor(req.url);
              if (req.method === "GET" && path === "/icon-style") {
                const cur = domain.global.get();
                return send(200, {
                  ok: true,
                  style: isIconStyle(cur) ? cur : "blue-transparent",
                  styles: ICON_STYLES,
                });
              }
              if (req.method === "POST" && path === "/icon-style") {
                let body = {};
                try {
                  body = JSON.parse((await readBody(req)) || "{}");
                } catch {
                  return send(400, { ok: false, error: "invalid json" });
                }
                if (!isIconStyle(body.style)) {
                  return send(400, {
                    ok: false,
                    error: `style must be one of: ${ICON_STYLES.join(", ")}`,
                  });
                }
                await domain.global.set(body.style);
                return send(200, { ok: true, style: body.style });
              }
              return send(404, { ok: false, error: "not found" });
            } catch (error) {
              return send(500, { ok: false, error: String(error) });
            }
          },
        }),
      );
    };

    register().catch((error) => {
      ctx.logger?.error?.("[dshharness-shell] init failed: " + error);
    });

    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dshharness-shell: api");
}
