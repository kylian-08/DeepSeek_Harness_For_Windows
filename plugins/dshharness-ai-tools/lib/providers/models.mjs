// models.mjs — 中转站模型自动探测 + 分类。
// GET {base}/v1/models(OpenAI 兼容,已实测可用);按 supported_endpoint_types 与名称启发式分类。
import { promises as fs } from "node:fs";

function classify(m) {
  const id = String(m.id || "");
  const types = Array.isArray(m.supported_endpoint_types) ? m.supported_endpoint_types : [];
  const lower = id.toLowerCase();

  if (types.includes("image-generation")) return "image";
  if (types.includes("openai-video")) return "video";
  // 标注不全(如 qwen-image-max 只标了 openai)或未标注的兜底启发式
  if (/(image|img|pic|画画|生图|画图|绘图)/.test(lower) && !/(video|图片理解|image_understanding)/.test(lower)) return "image";
  if (/(^|-|_)(video|image-to-video|i2v|v2v|t2v|seedance|kling|vidu|wan|happyhorse|minimax|pixverse|hailuo|可灵|即梦)/.test(lower)) return "video";
  if (/(^|-|_)(tts|speech|voice|audio|语音|配音|朗读|eleven|indextts|minimax-speech|fish|cosyvoice)/.test(lower)) return "tts";
  if (/(ocr|vl-ocr|识别文字)/.test(lower)) return "ocr";
  if (/(^|-|_)(vl|vision|glm-4v|qwen-vl|image_understanding|看图|识图)/.test(lower)) return "vision";
  return "chat";
}

function summarize(resp) {
  const data = resp?.data;
  if (!Array.isArray(data)) return null;
  const out = { count: data.length, byType: {}, models: [] };
  for (const m of data) {
    const kind = classify(m);
    out.byType[kind] = (out.byType[kind] || 0) + 1;
    out.models.push({ id: m.id, kind, types: m.supported_endpoint_types || [] });
  }
  return out;
}

export async function probeModels({ base_url, api_key }, { timeoutMs = 30_000, signal } = {}) {
  const base = String(base_url || "https://www.zizidonghua.com/v1").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${base}/models`, {
      headers: { authorization: `Bearer ${api_key}` },
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
    if (!res.ok) {
      throw new Error(`模型探测 HTTP ${res.status}: ${json?.error?.message || text.slice(0, 300)}`);
    }
    const summary = summarize(json);
    if (!summary) throw new Error(`模型列表响应异常: ${text.slice(0, 300)}`);
    return { ok: true, base, at: new Date().toISOString(), ...summary };
  } catch (e) {
    return { ok: false, base, error: e.message };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// 从探测结果里挑"常用默认模型"给工具参数做 enum 提示
export function defaultSuggestions(summary) {
  if (!summary || !summary.ok) return {};
  const pick = (kind, idRx) => {
    const m = summary.models.find((x) => x.kind === kind && idRx.test(x.id));
    return m ? m.id : undefined;
  };
  return {
    ocr: pick("ocr", /ocr/i),
    image: pick("image", /qwen-image|gpt-image|omni/i),
    tts: pick("tts", /eleven/i),
    video: pick("video", /seedance|wan|kling/i),
    vision: pick("vision", /qwen3-vl|vl/i),
  };
}
