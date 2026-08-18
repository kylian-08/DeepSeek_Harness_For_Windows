// relay.mjs — 中转站 (zizidonghua.com, OpenAI 兼容) 能力:OCR / 生图 / TTS / 视频。
// 纯 node fetch 实现,零 npm 依赖;配置由调用方传入(私有存储,不落盘于本文件)。
import { promises as fs } from "node:fs";
import path from "node:path";

// 允许轮询的异步任务端点(适配中转站不同实现)
const VIDEO_POLL_PATHS = [
  (id) => `/video/generations/${id}`,
  (id) => `/video/tasks/${id}`,
  (id) => `/async-result/${id}`,
];
const VIDEO_POLL_INTERVAL_MS = 10_000;
const VIDEO_MAX_WAIT_MS = 30 * 60_000;

function baseUrl(cfg) {
  return String(cfg.base_url || "https://www.zizidonghua.com/v1").replace(/\/+$/, "");
}

async function httpJson(base, pathname, { method = "GET", body, apiKey, timeoutMs = 120_000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(base + pathname, {
      method,
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json body */ }
    if (!res.ok) {
      const msg = json?.error?.message || text.slice(0, 300);
      throw new Error(`中转站 HTTP ${res.status}: ${msg}`);
    }
    return { res, json, text };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function imageItem(pathOrUrl) {
  if (/^https?:\/\//.test(pathOrUrl)) return { type: "image_url", image_url: { url: pathOrUrl } };
  return { type: "image_url", image_url: { url: pathOrUrl } }; // 本地路径由调用方转 data URI 后传入
}

// 本地文件 -> data URI(>4MB 原图直发,无 PIL 压缩;中转站/智谱均接受)
export async function fileToDataUri(filePath) {
  const data = await fs.readFile(filePath);
  const mime = guessMime(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
}

function guessMime(p) {
  const ext = path.extname(p).toLowerCase();
  const map = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml" };
  return map[ext] || "image/jpeg";
}

export async function saveBuffer(dir, name, buf) {
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, name);
  await fs.writeFile(out, buf);
  return out;
}

// ── OCR / 图片问答 ─────────────────────────────────────────────────────────
export async function relayOcr(cfg, { image, question, model }, { outputDir, signal }) {
  const content = [{ type: "text", text: question || "请识别并输出图片中的全部文字。" }];
  content.push(image.startsWith("data:") || /^https?:\/\//.test(image)
    ? { type: "image_url", image_url: { url: image } }
    : { type: "image_url", image_url: { url: await fileToDataUri(image) } });

  const { json } = await httpJson(baseUrl(cfg), "/chat/completions", {
    method: "POST",
    apiKey: cfg.api_key,
    body: { model: model || cfg.model || "qwen-vl-ocr", messages: [{ role: "user", content }] },
    signal,
  });
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error(`OCR 响应异常: ${JSON.stringify(json).slice(0, 300)}`);
  return text;
}

// ── 文生图 ─────────────────────────────────────────────────────────────────
export async function relayImage(cfg, { prompt, model, size }, { outputDir, signal }) {
  const { json } = await httpJson(baseUrl(cfg), "/images/generations", {
    method: "POST",
    apiKey: cfg.api_key,
    body: { model: model || cfg.model || "qwen-image-max", prompt, ...(size ? { size } : {}) },
    timeoutMs: 180_000,
    signal,
  });
  const item = json?.data?.[0];
  if (!item) throw new Error(`生图响应异常: ${JSON.stringify(json).slice(0, 300)}`);

  let buf;
  if (item.b64_json) {
    buf = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    buf = Buffer.from(await (await fetch(item.url, { signal })).arrayBuffer());
  } else {
    throw new Error(`生图响应缺少 b64_json/url: ${JSON.stringify(item).slice(0, 200)}`);
  }
  const out = await saveBuffer(outputDir, `relay_img_${Date.now()}.png`, buf);
  return { file: out, format: item.b64_json ? "b64" : "url", model: model || cfg.model };
}

// ── TTS ────────────────────────────────────────────────────────────────────
export async function relayTts(cfg, { text, model, voice }, { outputDir, signal }) {
  const m = model || cfg.model || "eleven_v3";
  const body = { model: m, input: text };
  if (voice) body.voice = voice;
  else if (m.startsWith("eleven")) body.voice = "EXAVITQu4vr4xnSDxMaL"; // eleven 系必带 voice

  const { res } = await httpJson(baseUrl(cfg), "/audio/speech", {
    method: "POST", apiKey: cfg.api_key, body, timeoutMs: 120_000, signal,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const out = await saveBuffer(outputDir, `relay_tts_${Date.now()}.mp3`, buf);
  return { file: out, model: m };
}

// ── 视频 ───────────────────────────────────────────────────────────────────
function findVideoUrl(obj) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      for (const v of obj) { const r = findVideoUrl(v); if (r) return r; }
      return null;
    }
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "url" || k === "video_url" || k === "output" || k === "data") && typeof v === "string") return v;
      const r = findVideoUrl(v);
      if (r) return r;
    }
  }
  return null;
}

function findTaskId(obj) {
  if (obj && typeof obj === "object") {
    if (Array.isArray(obj)) {
      for (const v of obj) { const r = findTaskId(v); if (r) return r; }
      return null;
    }
    for (const k of ["id", "task_id", "taskId"]) {
      if (obj[k]) return String(obj[k]);
    }
    for (const v of Object.values(obj)) {
      const r = findTaskId(v);
      if (r) return r;
    }
  }
  return null;
}

export async function relayVideo(cfg, { prompt, model, imageUrl }, { outputDir, signal }) {
  const m = model || cfg.model;
  if (!m) throw new Error("未指定视频模型(中转站 /v1/models 探测 openai-video 分类)");
  const body = { model: m, prompt, ...(imageUrl ? { image_url: imageUrl } : {}) };

  const { json } = await httpJson(baseUrl(cfg), "/video/generations", {
    method: "POST", apiKey: cfg.api_key, body, timeoutMs: 120_000, signal,
  });

  let url = findVideoUrl(json);
  if (!url) {
    const taskId = findTaskId(json);
    if (!taskId) throw new Error(`无法解析视频地址或任务ID: ${JSON.stringify(json).slice(0, 300)}`);
    url = await pollVideoTask(cfg, taskId, signal);
  }

  let buf;
  if (url.startsWith("data:")) {
    buf = Buffer.from(url.split(",", 2)[1], "base64");
  } else {
    buf = Buffer.from(await (await fetch(url, { signal })).arrayBuffer());
  }
  const out = await saveBuffer(outputDir, `relay_video_${Date.now()}.mp4`, buf);
  return { file: out, model: m };
}

async function pollVideoTask(cfg, taskId, signal) {
  const waitedAt = Date.now();
  while (Date.now() - waitedAt < VIDEO_MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    for (const makePath of VIDEO_POLL_PATHS) {
      try {
        const { json } = await httpJson(baseUrl(cfg), makePath(taskId), { apiKey: cfg.api_key, signal });
        const data = json?.data && typeof json.data === "object" ? json.data : json;
        const status = String(data?.status || json?.task_status || "").toUpperCase();
        if (["FAIL", "FAILED", "CANCEL", "CANCELLED", "ERROR"].includes(status)) {
          throw new Error(`视频任务失败: ${data?.fail_reason || JSON.stringify(json).slice(0, 300)}`);
        }
        const url = findVideoUrl(json);
        if (url) return url;
      } catch (e) {
        if (e.message.startsWith("视频任务失败")) throw e;
        // 404 / 网络错 → 试下一个端点
      }
    }
  }
  throw new Error("视频任务超过 30 分钟未完成");
}
