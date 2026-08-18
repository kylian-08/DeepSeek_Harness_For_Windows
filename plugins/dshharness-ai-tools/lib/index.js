// dshharness-ai-tools — server half.
//
// 把本机"外挂能力"(中转站 OCR/生图/TTS/视频、智谱识图/生图/视频、
// AutoGLM 生图/搜图、ffmpeg 视频处理)注册为 dsh 可调用工具。
//
// 设计:
// - API key 私有存储于 <DSH_HOME>/storages/ai-tools.json(DSH_HOME 在 git 之外),
//   由 scripts/ensure-ai-tools.js 首次装配时从本机已有 skill 配置迁移。
// - 全部工具经 ctx.effect(() => ctx.tools.register(...)) 注册(热重载/卸载安全)。
// - 生成物写入当前工作区 output/(exec.agent 无工作区概念时回落 DSH_HOME/output)。
import { defineTool } from "@deepseek-ai/dsh-tools";
import { z } from "zod";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import * as relay from "./providers/relay.mjs";
import * as zhipu from "./providers/zhipu.mjs";
import * as autoglm from "./providers/autoglm.mjs";
import * as ffmpeg from "./providers/ffmpeg.mjs";
import { probeModels, defaultSuggestions } from "./providers/models.mjs";

export const name = "dshharness-ai-tools";
export const inject = ["tools", "storage", "webServer"];

const STORAGE_DOMAIN = "ai_tools"; // UNIT_NAME_RE: [a-z][a-z0-9_]*
const MODELS_CACHE_KEY = "models-cache";
const OUTPUT_SUBDIR = "output";

// ── 私有存储 ───────────────────────────────────────────────────────────────

function defaultStorage() {
  return {
    relay: { base_url: "https://www.zizidonghua.com/v1", api_key: "" },
    zhipu: { api_key: "" },
  };
}

function maskKey(k) {
  if (!k || typeof k !== "string") return "";
  if (k.length <= 8) return "****";
  return k.slice(0, 4) + "****" + k.slice(-4);
}

// ── 输出目录 ───────────────────────────────────────────────────────────────

// 生成物写到 <workspace>/output/;workspace 取当前会话工作区(经 exec.agent 链),
// 取不到时回落 DSH_HOME/output。DSH_HOME 在 git 之外,天然私有。
function workspaceOf(exec) {
  const candidates = [];
  let node = exec;
  for (let i = 0; i < 8 && node; i++) {
    for (const key of ["workspace", "workdir", "cwd"]) {
      const v = node[key];
      if (typeof v === "string") candidates.push(v);
      else if (v && typeof v === "object" && typeof v.path === "string") candidates.push(v.path);
    }
    node = node.agent ?? null;
    if (node && typeof node === "object" && !node.session) node = node.session ?? null;
  }
  return candidates.find((c) => fs.existsSync(c)) || null;
}

function outputDirFor(exec, home) {
  const ws = workspaceOf(exec);
  return path.join(ws || home, OUTPUT_SUBDIR);
}

function dshHome() {
  return process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(os.homedir(), ".dsh");
}

// ── 工具输出渲染 ───────────────────────────────────────────────────────────

const textOut = (schema) => ({
  schema,
  render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const STRING = { type: "string" };

// ── 装配 ───────────────────────────────────────────────────────────────────

export function apply(ctx) {
  let storageDomain;
  const domainPromise = ctx.storage.domain
    .open({ name: STORAGE_DOMAIN, version: 1, tables: {}, global: { schema: z.object({}).passthrough(), initial: defaultStorage() } })
    .then((d) => {
      storageDomain = d;
      return d;
    })
    .catch((e) => {
      ctx.logger?.error?.("[ai-tools] storage open failed: " + e.message);
      return null;
    });

  const getConfig = async () => {
    const d = storageDomain || (await domainPromise);
    if (!d) return defaultStorage();
    const cur = d.global.get();
    return { ...defaultStorage(), ...(cur && typeof cur === "object" ? cur : {}) };
  };

  const setConfig = async (patch) => {
    const d = storageDomain || (await domainPromise);
    if (!d) throw new Error("storage unavailable");
    const next = { ...(await getConfig()), ...patch };
    await d.global.set(next);
    return next;
  };

  // ── webServer:设置页配置读写 + 模型探测 ───────────────────────────────
  const API_PREFIX = "/dshharness/ai-tools/api";
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let chunks = "";
      req.on("data", (c) => {
        chunks += c;
        if (chunks.length > 256 * 1024) { reject(new Error("body too large")); req.destroy(); }
      });
      req.on("end", () => resolve(chunks));
      req.on("error", reject);
    });

  ctx.effect(() => {
    const disposers = [];
    const register = async () => {
      const d = storageDomain || (await domainPromise);
      if (!d) return;
      disposers.push(ctx.webServer.register({
        kind: "prefix",
        path: API_PREFIX,
        handler: async (req, res) => {
          const send = (code, obj) => {
            res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(obj));
          };
          try {
            const url = new URL(req.url || "/", "http://localhost");
            const p = url.pathname.replace(new RegExp(`^${API_PREFIX}`), "") || "/";

            if (req.method === "GET" && p === "/config") {
              const cfg = await getConfig();
              return send(200, { ok: true, config: {
                relay: { base_url: cfg.relay.base_url, api_key: maskKey(cfg.relay.api_key), api_key_set: !!cfg.relay.api_key },
                zhipu: { api_key: maskKey(cfg.zhipu.api_key), api_key_set: !!cfg.zhipu.api_key },
              } });
            }
            if (req.method === "POST" && p === "/config") {
              const body = JSON.parse((await readBody(req)) || "{}");
              const patch = {};
              if (body.relay) {
                const r = { ...(await getConfig()).relay };
                if (typeof body.relay.base_url === "string" && body.relay.base_url.trim()) r.base_url = body.relay.base_url.trim();
                if (typeof body.relay.api_key === "string" && body.relay.api_key.trim()) r.api_key = body.relay.api_key.trim();
                patch.relay = r;
              }
              if (body.zhipu && typeof body.zhipu.api_key === "string" && body.zhipu.api_key.trim()) {
                patch.zhipu = { ...(await getConfig()).zhipu, api_key: body.zhipu.api_key.trim() };
              }
              await setConfig(patch);
              return send(200, { ok: true });
            }
            if (req.method === "GET" && p === "/probe") {
              const cfg = await getConfig();
              const summary = await probeModels(cfg.relay);
              if (summary.ok) {
                await d.global.set({ ...cfg, [MODELS_CACHE_KEY]: summary });
                return send(200, { ok: true, summary });
              }
              return send(200, { ok: false, error: summary.error });
            }
            if (req.method === "GET" && p === "/models") {
              const cfg = await getConfig();
              const cached = cfg[MODELS_CACHE_KEY];
              if (cached) return send(200, { ok: true, summary: cached, cached: true });
              const summary = await probeModels(cfg.relay);
              if (summary.ok) {
                await d.global.set({ ...cfg, [MODELS_CACHE_KEY]: summary });
                return send(200, { ok: true, summary, cached: false });
              }
              return send(200, { ok: false, error: summary.error });
            }
            return send(404, { ok: false, error: "not found" });
          } catch (e) {
            return send(500, { ok: false, error: String(e && e.message || e) });
          }
        },
      }));
    };
    register().catch((e) => ctx.logger?.error?.("[ai-tools] webServer init failed: " + e.message));
    return () => { for (const d of disposers) d(); };
  }, "dshharness-ai-tools: api");

  // ── 工具注册 ───────────────────────────────────────────────────────────

  const reg = (tool, label) => {
    ctx.effect(() => ctx.tools.register(tool), `dshharness-ai-tools: ${label}`);
  };

  // 中转站 OCR
  reg(defineTool({
    name: "relay_ocr",
    description: "用中转站视觉模型识别图片文字或看图问答(默认 qwen-vl-ocr)。参数 image 传本地绝对路径或 http(s) URL;question 可选,缺省为提取全部文字。",
    parameters: {
      image: { type: "string", required: true, description: "图片的本地绝对路径或 http(s) URL" },
      question: { type: "string", description: "可选的提问/指令,缺省识别全部文字" },
      model: { type: "string", description: "中转站 OCR 模型(探测后可选 qwen-vl-ocr 等)" },
    },
    output: textOut({ type: "string" }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.relay.api_key) throw new Error("中转站未配置 API Key(设置 → AI 外挂能力,或运行 ensure-ai-tools 迁移)");
      const home = dshHome();
      return await relay.relayOcr(cfg.relay, args, { outputDir: outputDirFor(exec, home), signal: exec.signal });
    },
  }), "relay_ocr");

  // 中转站生图
  reg(defineTool({
    name: "relay_image",
    description: "用中转站文生图模型生成高质量图片(默认 qwen-image-max,可探测到 gpt-image-2、Omni-Image2 等)。结果保存到工作区 output/ 目录。",
    parameters: {
      prompt: { type: "string", required: true, description: "图片描述提示词" },
      model: { type: "string", description: "生图模型名,缺省用配置默认" },
      size: { type: "string", description: "尺寸如 1024x1024,缺省模型默认" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" }, model: { type: "string" }, format: { type: "string" } } }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.relay.api_key) throw new Error("中转站未配置 API Key");
      return await relay.relayImage(cfg.relay, args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "relay_image");

  // 中转站 TTS
  reg(defineTool({
    name: "relay_tts",
    description: "用中转站 TTS 模型把文本合成语音 mp3(默认 eleven_v3,eleven 系需 voice 参数,缺省用 Sarah 音色)。结果保存到 output/。",
    parameters: {
      text: { type: "string", required: true, description: "要朗读的文本" },
      model: { type: "string", description: "TTS 模型(eleven_v3 等)" },
      voice: { type: "string", description: "音色 ID,eleven 系缺省 EXAVITQu4vr4xnSDxMaL" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" }, model: { type: "string" } } }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.relay.api_key) throw new Error("中转站未配置 API Key");
      return await relay.relayTts(cfg.relay, args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "relay_tts");

  // 中转站视频
  reg(defineTool({
    name: "relay_video",
    description: "用中转站视频模型生成视频(文生视频或图生视频,默认 doubao-seedance-2-0-fast-720p 等 openai-video 分类模型)。imageUrl 需为公网 URL(本地文件需先上传/转 URL)。结果保存到 output/。",
    parameters: {
      prompt: { type: "string", required: true, description: "视频内容提示词" },
      model: { type: "string", description: "视频模型名(探测 openai-video 分类)" },
      imageUrl: { type: "string", description: "图生视频起始图片公网 URL" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" }, model: { type: "string" } } }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.relay.api_key) throw new Error("中转站未配置 API Key");
      return await relay.relayVideo(cfg.relay, args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "relay_video");

  // 智谱识图
  reg(defineTool({
    name: "zhipu_vision",
    description: "用智谱 GLM-4V-Flash 识图或图片问答(免费)。参数 image 传本地路径或 URL。",
    parameters: {
      image: { type: "string", required: true, description: "图片的本地绝对路径或 http(s) URL" },
      question: { type: "string", description: "可选的提问/指令" },
      model: { type: "string", description: "视觉模型,缺省 glm-4v-flash" },
    },
    output: textOut({ type: "string" }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.zhipu.api_key) throw new Error("智谱未配置 API Key");
      return await zhipu.zhipuVision(cfg.zhipu, args, { signal: exec.signal });
    },
  }), "zhipu_vision");

  // 智谱生图
  reg(defineTool({
    name: "zhipu_image",
    description: "用智谱 CogView-3-Flash 免费文生图。尺寸仅支持 1024x1024 / 1024x768 / 768x1024。结果保存到 output/。",
    parameters: {
      prompt: { type: "string", required: true, description: "图片描述提示词" },
      size: { type: "string", description: "1024x1024 / 1024x768 / 768x1024,缺省 1024x1024" },
      model: { type: "string", description: "模型名,缺省 cogview-3-flash" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" }, model: { type: "string" } } }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.zhipu.api_key) throw new Error("智谱未配置 API Key");
      return await zhipu.zhipuImage(cfg.zhipu, args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "zhipu_image");

  // 智谱视频
  reg(defineTool({
    name: "zhipu_video",
    description: "用智谱 CogVideoX-Flash 免费生成视频(文生视频或图生视频,imageUrl 需公网 URL,生成约 1-5 分钟)。结果保存到 output/。",
    parameters: {
      prompt: { type: "string", required: true, description: "视频内容提示词" },
      imageUrl: { type: "string", description: "图生视频起始图片公网 URL" },
      model: { type: "string", description: "模型名,缺省 cogvideox-flash" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" }, model: { type: "string" } } }),
    async execute(args, exec) {
      const cfg = await getConfig();
      if (!cfg.zhipu.api_key) throw new Error("智谱未配置 API Key");
      return await zhipu.zhipuVideo(cfg.zhipu, args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "zhipu_video");

  // AutoGLM 生图
  reg(defineTool({
    name: "autoglm_image",
    description: "AutoGLM 文生图,依赖本地 token 服务 http://127.0.0.1:53699/get_token 存活。返回图片 URL。",
    parameters: {
      text: { type: "string", required: true, description: "图片描述文字" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { url: { type: "string" } } }),
    async execute(args, exec) {
      const probe = await autoglm.checkTokenService();
      if (!probe.ok) throw new Error(probe.error);
      return await autoglm.autoglmImage(args, { signal: exec.signal });
    },
  }), "autoglm_image");

  // AutoGLM 搜图
  reg(defineTool({
    name: "autoglm_search_image",
    description: "AutoGLM 搜图,按关键词返回图片结果列表(URL/说明/来源),依赖本地 token 服务存活。",
    parameters: {
      query: { type: "string", required: true, description: "搜索关键词" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { count: { type: "integer" }, results: { type: "array" } } }),
    async execute(args, exec) {
      const probe = await autoglm.checkTokenService();
      if (!probe.ok) throw new Error(probe.error);
      return await autoglm.autoglmSearchImage(args, { signal: exec.signal });
    },
  }), "autoglm_search_image");

  // ffmpeg 抽帧
  reg(defineTool({
    name: "video_extract_frames",
    description: "用 ffmpeg 从视频抽帧:按时间点(如 00:00:10)、帧序号或均匀抽 N 帧。需系统已装 ffmpeg。结果保存到 output/。",
    parameters: {
      video: { type: "string", required: true, description: "视频文件绝对路径" },
      time: { type: "string", description: "时间点 HH:MM:SS(与 index/count 互斥)" },
      index: { type: "integer", description: "帧序号(从 0 起)" },
      count: { type: "integer", description: "均匀抽取 N 帧(需 ffprobe)" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { frames: { type: "array" } } }),
    async execute(args, exec) {
      if (!(await ffmpeg.ffmpegAvailable())) throw new Error("ffmpeg 未安装或不在 PATH(DSH4Win 不内置 ffmpeg)");
      return await ffmpeg.extractFrames(args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "video_extract_frames");

  // ffmpeg 编辑
  reg(defineTool({
    name: "video_edit",
    description: "用 ffmpeg 编辑视频:operation 支持 cut(裁剪 start/end)、transcode(转 mp4)、compress(压缩 crf/scale)、extract_audio(抽音)、speed(倍速 rate)、gif(转 gif)、resize、aspect(改比例加黑边)、raw(直接传 ffmpeg 参数数组 args)。结果保存到 output/ 或指定 output。",
    parameters: {
      input: { type: "string", required: true, description: "输入视频绝对路径" },
      operation: { type: "string", required: true, description: "cut/transcode/compress/extract_audio/speed/gif/resize/aspect/raw" },
      args: { type: "json", description: "raw 模式:ffmpeg 参数数组;或操作的参数对象(如 {start,duration,crf,width,height,rate,fps})" },
      output: { type: "string", description: "输出绝对路径,缺省自动命名到 output/" },
      overwrite: { type: "boolean", description: "是否 -y 覆盖已存在文件" },
    },
    output: textOut({ type: "object", additionalProperties: false, properties: { file: { type: "string" } } }),
    async execute(args, exec) {
      if (!(await ffmpeg.ffmpegAvailable())) throw new Error("ffmpeg 未安装或不在 PATH");
      return await ffmpeg.editVideo(args, { outputDir: outputDirFor(exec, dshHome()), signal: exec.signal });
    },
  }), "video_edit");

  // 模型探测
  reg(defineTool({
    name: "ai_tools_models",
    description: "探测中转站可用模型并按能力分类(生图/视频/OCR/TTS/识图/chat),返回各分类模型列表与默认建议。生成内容/视频/音频前可先调用本工具选模型。",
    parameters: {},
    output: textOut({ type: "object", additionalProperties: true }),
    async execute(_args, exec) {
      const cfg = await getConfig();
      if (!cfg.relay.api_key) throw new Error("中转站未配置 API Key");
      const summary = await probeModels(cfg.relay, { signal: exec.signal });
      if (!summary.ok) throw new Error(summary.error);
      return { ...summary, defaults: defaultSuggestions(summary) };
    },
  }), "ai_tools_models");

  // 状态诊断
  reg(defineTool({
    name: "ai_tools_status",
    description: "诊断各外挂提供方配置与连通性:中转站(Key/模型探测)、智谱(Key)、AutoGLM(本地 token 服务)、ffmpeg(是否安装)。",
    parameters: {},
    output: textOut({ type: "object", additionalProperties: true }),
    async execute(_args) {
      const cfg = await getConfig();
      const [token, ff] = await Promise.all([autoglm.checkTokenService(), ffmpeg.ffmpegAvailable()]);
      const probe = cfg.relay.api_key ? await probeModels(cfg.relay) : { ok: false, error: "未配置 Key" };
      return {
        relay: { configured: !!cfg.relay.api_key, base_url: cfg.relay.base_url, key: maskKey(cfg.relay.api_key), probe: probe.ok ? { ok: true, count: probe.count, byType: probe.byType } : { ok: false, error: probe.error } },
        zhipu: { configured: !!cfg.zhipu.api_key, key: maskKey(cfg.zhipu.api_key) },
        autoglm: token,
        ffmpeg: { installed: ff },
      };
    },
  }), "ai_tools_status");
}
