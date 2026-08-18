// dshharness-ai-tools — client half.
// 设置页新增"AI 外挂能力"section:展示各提供方配置状态、编辑 API Key、
// 一键探测中转站模型并按能力分类展示。
// Slot contract (rc.6): `ctx.slots.register(options, component)` — the
// component is the SECOND argument; a single-object form leaves
// entry.component undefined and the section silently fails to render.
window.__ModuleLoader__.load({
  id: "@dshharness/ai-tools",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");

    var API = "/dshharness/ai-tools/api";
    var CAT_LABELS = { image: "生图", video: "视频", tts: "语音合成", ocr: "OCR", vision: "识图/问答", chat: "对话/其他" };
    var CAT_ORDER = ["image", "video", "tts", "ocr", "vision", "chat"];

    function fetchJson(path, init) {
      return fetch(API + path, {
        headers: { "content-type": "application/json" },
        ...init,
      }).then(function (r) { return r.json(); });
    }

    function AiToolsSection() {
      var state = React.useState({
        relay: { base_url: "", api_key: "", api_key_set: false },
        zhipu: { api_key: "", api_key_set: false },
        relayBaseInput: "",
        relayKeyInput: "",
        zhipuKeyInput: "",
        probeMsg: "",
        probeOk: false,
        probeError: "",
        cats: [],
        loading: false,
      });
      var s = state[0];
      var set = state[1];

      React.useEffect(function () {
        var cancelled = false;
        fetchJson("/config").then(function (r) {
          if (!cancelled && r && r.ok) {
            set(function (prev) {
              return Object.assign({}, prev, {
                relay: r.config.relay,
                zhipu: r.config.zhipu,
              });
            });
          }
        }).catch(function () {});
        fetchJson("/models").then(function (r) {
          if (!cancelled && r && r.ok) {
            set(function (prev) {
              return Object.assign({}, prev, {
                probeMsg: "共 " + r.summary.count + " 个模型",
                probeOk: true,
                probeError: "",
                cats: r.summary.models,
              });
            });
          }
        }).catch(function () {});
        return function () { cancelled = true; };
      }, []);

      function saveRelay() {
        var payload = { relay: {} };
        if (s.relayBaseInput.trim()) payload.relay.base_url = s.relayBaseInput.trim();
        if (s.relayKeyInput.trim()) payload.relay.api_key = s.relayKeyInput.trim();
        fetchJson("/config", { method: "POST", body: JSON.stringify(payload) }).then(function (r) {
          if (r && r.ok) {
            set(function (prev) {
              return Object.assign({}, prev, { relayBaseInput: "", relayKeyInput: "" });
            });
            fetchJson("/config").then(function (rr) {
              if (rr && rr.ok) set(function (prev) {
                return Object.assign({}, prev, { relay: rr.config.relay });
              });
            });
          }
        }).catch(function () {});
      }

      function saveZhipu() {
        if (!s.zhipuKeyInput.trim()) return;
        fetchJson("/config", {
          method: "POST",
          body: JSON.stringify({ zhipu: { api_key: s.zhipuKeyInput.trim() } }),
        }).then(function (r) {
          if (r && r.ok) {
            set(function (prev) {
              return Object.assign({}, prev, { zhipuKeyInput: "" });
            });
            fetchJson("/config").then(function (rr) {
              if (rr && rr.ok) set(function (prev) {
                return Object.assign({}, prev, { zhipu: rr.config.zhipu });
              });
            });
          }
        }).catch(function () {});
      }

      function probe() {
        set(function (prev) { return Object.assign({}, prev, { loading: true }); });
        fetchJson("/probe").then(function (r) {
          if (r && r.ok) {
            set(function (prev) {
              return Object.assign({}, prev, {
                loading: false,
                probeMsg: "共 " + r.summary.count + " 个模型",
                probeOk: true,
                probeError: "",
                cats: r.summary.models,
              });
            });
          } else {
            set(function (prev) {
              return Object.assign({}, prev, {
                loading: false,
                probeMsg: "",
                probeOk: false,
                probeError: (r && r.error) || "探测失败",
                cats: [],
              });
            });
          }
        }).catch(function () {
          set(function (prev) {
            return Object.assign({}, prev, { loading: false, probeMsg: "", probeOk: false, probeError: "探测请求失败", cats: [] });
          });
        });
      }

      var h = React.createElement;
      var inputStyle = {
        flex: 1,
        background: "var(--theme-input-bg, #111)",
        color: "var(--theme-text, #ddd)",
        border: "1px solid var(--theme-border, #333)",
        borderRadius: 6,
        padding: "6px 8px",
        fontSize: 12,
      };
      var btnStyle = {
        background: "var(--theme-accent, #4a9eff)",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      };
      var ghostBtn = Object.assign({}, btnStyle, {
        background: "transparent",
        border: "1px solid var(--theme-border, #444)",
        color: "var(--theme-text, #ccc)",
      });
      var blockStyle = {
        border: "1px solid var(--theme-border, #333)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
      };
      var rowStyle = { display: "flex", gap: 6, marginTop: 8, alignItems: "center" };
      var dimStyle = { color: "var(--theme-text-secondary, #888)", fontSize: 11 };
      var okColor = "#2ecc71";
      var errColor = "#e74c3c";

      var catBlocks = CAT_ORDER
        .map(function (kind) {
          var list = s.cats.filter(function (m) { return m.kind === kind; });
          if (list.length === 0) return null;
          return h("div", {
            key: kind,
            style: { border: "1px solid var(--theme-border,#333)", borderRadius: 8, padding: "8px 10px", minWidth: 150, flex: 1 },
          },
            h("b", { style: { display: "block", marginBottom: 4, fontSize: 11 } },
              (CAT_LABELS[kind] || kind) + " ×" + list.length),
            h("span", { style: { fontSize: 11, color: "var(--theme-text-secondary,#999)", wordBreak: "break-all", whiteSpace: "pre-wrap" } },
              list.slice(0, 40).map(function (m) { return m.id; }).join("\n")),
          );
        })
        .filter(Boolean);

      return h("div", {
        style: { padding: "4px 2px", color: "var(--fg, #e8ecf5)", fontFamily: "ui-monospace,monospace", fontSize: 12, lineHeight: 1.6, maxWidth: 760 },
      },
        h("h3", { style: { margin: "0 0 10px", fontSize: 13 } }, "AI 外挂能力（dshharness-ai-tools）"),
        h("div", { style: dimStyle },
          "为 AI 提供中转站 OCR/生图/TTS/视频、智谱识图/生图/视频、AutoGLM 生图/搜图、ffmpeg 视频处理工具。API Key 仅保存在本机 ~/.dsh(storages/ai_tools.json),不上传。"),

        // ── 中转站 ──
        h("div", { style: blockStyle },
          h("h4", { style: { margin: "0 0 8px", fontSize: 12 } }, "中转站 (zizidonghua.com) — OCR / 生图 / TTS / 视频"),
          h("div", { style: rowStyle },
            h("span", { style: dimStyle }, "Base URL: " + s.relay.base_url),
            h("span", { style: { color: s.relay.api_key_set ? okColor : errColor, fontSize: 11 } },
              s.relay.api_key_set ? "已配置" : "未配置"),
            h("span", { style: dimStyle }, "Key: " + s.relay.api_key),
          ),
          h("div", { style: rowStyle },
            h("input", {
              style: inputStyle,
              placeholder: "Base URL(留空不修改)",
              value: s.relayBaseInput,
              onChange: function (e) { set(function (p) { return Object.assign({}, p, { relayBaseInput: e.target.value }); }); },
            }),
            h("input", {
              style: inputStyle,
              placeholder: "API Key(sk-...),留空不修改",
              type: "password",
              value: s.relayKeyInput,
              onChange: function (e) { set(function (p) { return Object.assign({}, p, { relayKeyInput: e.target.value }); }); },
            }),
            h("button", { style: ghostBtn, onClick: saveRelay }, "保存 Key"),
          ),
          h("div", { style: rowStyle },
            h("button", { style: btnStyle, onClick: probe, disabled: s.loading },
              s.loading ? "探测中…" : "探测中转站可用模型并分类"),
          ),
          s.probeMsg
            ? h("div", { style: { marginTop: 8, fontSize: 11, color: okColor } }, s.probeMsg)
            : null,
          s.probeError
            ? h("div", { style: { marginTop: 8, fontSize: 11, color: errColor } }, "探测失败: " + s.probeError)
            : null,
          catBlocks.length > 0
            ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 } }, catBlocks)
            : null,
        ),

        // ── 智谱 ──
        h("div", { style: blockStyle },
          h("h4", { style: { margin: "0 0 8px", fontSize: 12 } }, "智谱 (open.bigmodel.cn) — 识图 / 生图 / 视频(免费)"),
          h("div", { style: rowStyle },
            h("span", { style: dimStyle }, "Key: " + s.zhipu.api_key),
            h("span", { style: { color: s.zhipu.api_key_set ? okColor : errColor, fontSize: 11 } },
              s.zhipu.api_key_set ? "已配置" : "未配置"),
          ),
          h("div", { style: rowStyle },
            h("input", {
              style: inputStyle,
              placeholder: "API Key(留空不修改)",
              type: "password",
              value: s.zhipuKeyInput,
              onChange: function (e) { set(function (p) { return Object.assign({}, p, { zhipuKeyInput: e.target.value }); }); },
            }),
            h("button", { style: ghostBtn, onClick: saveZhipu }, "保存 Key"),
          ),
        ),

        // ── AutoGLM / ffmpeg ──
        h("div", { style: blockStyle },
          h("h4", { style: { margin: "0 0 8px", fontSize: 12 } }, "AutoGLM(生图/搜图) 与 ffmpeg(视频处理)"),
          h("div", { style: dimStyle },
            "AutoGLM 依赖本地 token 服务 http://127.0.0.1:53699/get_token;ffmpeg 需已安装并加入 PATH。二者状态可用工具 ai_tools_status 诊断。"),
        ),
      );
    }

    exports.inject = ["slots"];

    exports.apply = function (ctx) {
      ctx.effect(function () {
        return ctx.slots.inject("settings.section", function () {
          return ctx.slots.register(
            {
              name: "settings.section",
              id: "dshharness-ai-tools",
              order: 80,
              label: function () { return "AI 外挂能力"; },
            },
            AiToolsSection,
          );
        });
      }, "dshharness-ai-tools: settings section");
    };

    return module.exports;
  },
});
