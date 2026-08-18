// zhipu.mjs — 智谱 (open.bigmodel.cn) 能力:识图 / 生图 / 视频。
// 纯 node fetch 实现,零 npm 依赖。
import { promises as fs } from "node:fs";
import path from "node:path";

const BASE = "https://open.bigmodel.cn/api/paas/v4";
const VISION_MODEL = "glm-4v-flash";
const IMAGE_MODEL = "cogview-3-flash";
const VIDEO_MODEL = "cogvideox-flash";
const POLL_INTERVAL_MS = 10_000;
const VIDEO_MAX_WAIT_MS = 15 * 60_000;

async function httpJson(pathname, { method = "GET", body, apiKey, timeoutMs = 180_000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(BASE + pathname, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    if (!res.ok) {
      throw new Error(`智谱 HTTP ${res.status}: ${json?.error?.message || text.slice(0, 300)}`);
    }
    return { json, text };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function fileToDataUri(filePath) {
  const data = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const map = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
  return `data:${map[ext] || "image/jpeg"};base64,${data.toString("base64")}`;
}

async function saveBuffer(dir, name, buf) {
  await fs.mkdir(dir, { recursive: true });
  const out = path.join(dir, name);
  await fs.writeFile(out, buf);
  return out;
}

// ── 识图 / 图片问答 ────────────────────────────────────────────────────────
export async function zhipuVision(cfg, { image, question, model }, { signal }) {
  const content = [{ type: "text", text: question || "请识别并输出图片中的全部文字。" }];
  content.push(/^https?:\/\//.test(image) || image.startsWith("data:")
    ? { type: "image_url", image_url: { url: image } }
    : { type: "image_url", image_url: { url: await fileToDataUri(image) } });

  const { json } = await httpJson("/chat/completions", {
    method: "POST",
    apiKey: cfg.api_key,
    body: { model: model || VISION_MODEL, temperature: 0.3, messages: [{ role: "user", content }] },
    signal,
  });
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error(`识图响应异常: ${JSON.stringify(json).slice(0, 300)}`);
  return text;
}

// ── 文生图 ─────────────────────────────────────────────────────────────────
export async function zhipuImage(cfg, { prompt, size, model }, { outputDir, signal }) {
  const { json } = await httpJson("/images/generations", {
    method: "POST",
    apiKey: cfg.api_key,
    body: { model: model || IMAGE_MODEL, prompt, ...(size ? { size } : {}) },
    signal,
  });
  const url = json?.data?.[0]?.url;
  if (!url) throw new Error(`生图响应异常: ${JSON.stringify(json).slice(0, 300)}`);
  const buf = Buffer.from(await (await fetch(url, { signal })).arrayBuffer());
  const out = await saveBuffer(outputDir, `zhipu_img_${Date.now()}.png`, buf);
  return { file: out, model: model || IMAGE_MODEL };
}

// ── 文/图生视频 ────────────────────────────────────────────────────────────
export async function zhipuVideo(cfg, { prompt, imageUrl, model }, { outputDir, signal }) {
  const m = model || VIDEO_MODEL;
  const body = { model: m, prompt, ...(imageUrl ? { image_url: imageUrl } : {}) };
  const { json } = await httpJson("/videos/generations", { method: "POST", apiKey: cfg.api_key, body, signal });
  const taskId = json?.id;
  if (!taskId) throw new Error(`无法获取视频任务ID: ${JSON.stringify(json).slice(0, 300)}`);

  const url = await pollResult(taskId, signal, cfg, (result) => {
    const status = result?.task_status || "";
    if (["FAIL", "CANCEL", "ERROR"].includes(String(status).toUpperCase())) {
      throw new Error(`视频任务失败: ${JSON.stringify(result).slice(0, 300)}`);
    }
    const vr = result?.video_result;
    if (typeof vr === "string" && /^https?:/.test(vr)) return vr;
    if (Array.isArray(vr)) {
      const first = vr.find((v) => v && typeof v === "object" && v.url);
      if (first) return first.url;
    }
    if (vr && typeof vr === "object" && vr.url) return vr.url;
    return null;
  });

  const buf = Buffer.from(await (await fetch(url, { signal })).arrayBuffer());
  const out = await saveBuffer(outputDir, `zhipu_video_${Date.now()}.mp4`, buf);
  return { file: out, model: m };
}

async function pollResult(taskId, signal, cfg, extract) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < VIDEO_MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { json } = await httpJson(`/async-result/${taskId}`, { apiKey: cfg.api_key, signal, timeoutMs: 60_000 });
    const url = extract(json);
    if (url) return url;
  }
  throw new Error("视频任务超过 15 分钟未完成");
}
