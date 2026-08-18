// autoglm.mjs — AutoGLM (zhipu agentdr) 能力:文生图 / 搜图。
// Token 从本地服务 http://127.0.0.1:53699/get_token 获取;每次请求动态计算 md5 签名。
import { createHash } from "node:crypto";

const APP_ID = "100003";
const APP_KEY = "38d2391985e2369a5fb8227d8e6cd5e5";
const BASE = "https://autoglm-api.zhipuai.cn/agentdr/v1/assistant/skills";
const TOKEN_URL = "http://127.0.0.1:53699/get_token";

export async function checkTokenService(timeoutMs = 2000) {
  try {
    const res = await fetch(TOKEN_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, error: `本地 token 服务 HTTP ${res.status}` };
    const token = (await res.text()).trim();
    return token ? { ok: true, token } : { ok: false, error: "本地 token 服务返回空" };
  } catch (e) {
    return { ok: false, error: `本地 token 服务不可达(需运行 127.0.0.1:53699): ${e.message}` };
  }
}

async function fetchToken() {
  const res = await fetch(TOKEN_URL, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`本地 token 服务 HTTP ${res.status}`);
  let token = (await res.text()).trim();
  if (!token) throw new Error("本地 token 服务返回空");
  if (!/^bearer /i.test(token)) token = `Bearer ${token}`;
  return token;
}

function signHeaders() {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = createHash("md5").update(`${APP_ID}&${timestamp}&${APP_KEY}`, "utf8").digest("hex");
  return {
    "X-Auth-Appid": APP_ID,
    "X-Auth-TimeStamp": timestamp,
    "X-Auth-Sign": sign,
  };
}

async function post(pathname, body, signal) {
  const token = await fetchToken();
  const res = await fetch(`${BASE}/${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token,
      ...signHeaders(),
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  if (!res.ok) throw new Error(`AutoGLM HTTP ${res.status}: ${json?.message || text.slice(0, 300)}`);
  return json;
}

// 文生图:返回图片 URL
export async function autoglmImage({ text }, { signal }) {
  const json = await post("generate-image", { text }, signal);
  const url = json?.data?.image_url;
  if (!url) throw new Error(`AutoGLM 生图响应异常: ${JSON.stringify(json).slice(0, 300)}`);
  return { url };
}

// 搜图:返回结果列表
export async function autoglmSearchImage({ query }, { signal }) {
  const json = await post("search-image", { query }, signal);
  const results = json?.data?.results;
  if (!Array.isArray(results)) throw new Error(`AutoGLM 搜图响应异常: ${JSON.stringify(json).slice(0, 300)}`);
  return {
    count: json?.data?.count ?? results.length,
    results: results.map((r) => ({
      url: r.original_url,
      caption: r.caption,
      source: r.source,
      width: r.original_width,
      height: r.original_height,
    })),
  };
}
