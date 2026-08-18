// ffmpeg.mjs — 视频处理:抽帧 + 常用编辑。依赖系统 PATH 中的 ffmpeg(DSH4Win 不内置)。
// 所有命令用 spawn 数组参数调用,杜绝 shell 注入。
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

export function ffmpegAvailable() {
  return new Promise((resolve) => {
    spawn("ffmpeg", ["-version"], { stdio: ["ignore", "ignore", "ignore"] })
      .on("error", () => resolve(false))
      .on("close", (code) => resolve(code === 0));
  });
}

function run(args, { timeoutMs = 10 * 60_000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    const onAbort = () => child.kill();
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg 无法启动(是否已安装并加入 PATH?): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export async function extractFrames({ video, time, index, count }, { outputDir, signal }) {
  if (!video) throw new Error("缺少视频路径参数 video");
  const inFile = path.resolve(video);
  if (!(await fs.stat(inFile).catch(() => null))) throw new Error(`视频文件不存在: ${inFile}`);

  const base = path.basename(inFile, path.extname(inFile));
  const frames = [];

  const grabOne = async (outName, args) => {
    const out = path.join(outputDir, outName);
    await run(args.concat([out]), { signal });
    frames.push(out);
  };

  if (count && count > 1) {
    // 均匀抽 N 帧:先用 ffprobe 取时长
    const duration = await probeDuration(inFile);
    const step = duration / count;
    for (let i = 0; i < count; i++) {
      const t = (i * step).toFixed(3);
      await grabOne(`${base}_frame_${i}_${t}s.jpg`, [
        "-hide_banner", "-loglevel", "error", "-y", "-ss", t, "-i", inFile, "-frames:v", "1",
      ]);
    }
  } else if (time !== undefined && time !== "") {
    await grabOne(`${base}_frame_${String(time).replace(/:/g, "-")}.jpg`, [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", String(time), "-i", inFile, "-frames:v", "1",
    ]);
  } else if (index !== undefined && index !== "") {
    await grabOne(`${base}_frame_${index}.png`, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", inFile, "-vf", `select=eq(n\\,${Number(index)})`, "-vframes", "1",
    ]);
  } else {
    await grabOne(`${base}_frame_0.png`, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", inFile, "-vf", "select=eq(n\\,0)", "-vframes", "1",
    ]);
  }
  return { frames };
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => {
      const n = Number(out.trim());
      resolve(Number.isFinite(n) && n > 0 ? n : 60);
    });
  });
}

// 常用编辑操作子集;raw 模式直接透传用户给的 ffmpeg 参数。
export async function editVideo({ input, operation, args, output, overwrite }, { outputDir, signal }) {
  if (!input) throw new Error("缺少输入视频路径 input");
  const inFile = path.resolve(input);
  if (!(await fs.stat(inFile).catch(() => null))) throw new Error(`输入文件不存在: ${inFile}`);
  const base = path.basename(inFile, path.extname(inFile));

  const outFile = output ? path.resolve(output) : path.join(outputDir, `${base}_${operation || "edited"}_${Date.now()}${extFor(operation, args)}`);
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  let cmd;
  if (operation === "raw") {
    if (!Array.isArray(args) || args.length === 0) throw new Error("raw 模式需要 args(ffmpeg 参数数组)");
    cmd = ["-hide_banner", "-loglevel", "error", ...(overwrite ? ["-y"] : []), "-i", inFile, ...args, outFile];
  } else {
    cmd = buildCommand(inFile, operation, args || {}, outFile, overwrite);
  }

  await run(cmd, { signal });
  return { file: outFile };
}

function extFor(op, args) {
  const map = { cut: ".mp4", transcode: ".mp4", compress: ".mp4", extract_audio: ".m4a", speed: ".mp4", gif: ".gif", aspect: ".mp4", resize: ".mp4", raw: ".out" };
  return map[op] || ".mp4";
}

function buildCommand(inFile, op, a, outFile, overwrite) {
  const head = ["-hide_banner", "-loglevel", "error", ...(overwrite ? ["-y"] : []), "-i", inFile];
  switch (op) {
    case "cut": // start/end(或 duration)裁剪
      return [...head, "-ss", String(a.start || "00:00:00"), ...(a.duration ? ["-t", String(a.duration)] : []), "-c", "copy", outFile];
    case "transcode": // 转 mp4(h264/aac)
      return [...head, "-c:v", a.vcodec || "libx264", "-c:a", a.acodec || "aac", "-movflags", "+faststart", outFile];
    case "compress": { // 压缩:crf 或 scale
      const vf = [];
      if (a.width || a.height) vf.push(`scale=${a.width || "-2"}:${a.height || "-2"}`);
      const vfArgs = vf.length ? ["-vf", vf.join(",")] : [];
      return [...head, ...vfArgs, "-c:v", a.vcodec || "libx264", "-crf", String(a.crf ?? 28), "-preset", a.preset || "medium", "-c:a", "aac", "-b:a", a.audioBitrate || "128k", outFile];
    }
    case "extract_audio":
      return [...head, "-vn", "-c:a", a.acodec || "aac", outFile];
    case "speed": // rate>1 加速,<1 慢放
      return [...head, "-filter_complex", `[0:v]setpts=${(1 / Number(a.rate || 2)).toFixed(4)}*PTS[v];[0:a]atempo=${Number(a.rate || 2).toFixed(2)}[a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", outFile];
    case "gif": // 片段转 gif
      return [...head, ...(a.start ? ["-ss", String(a.start)] : []), ...(a.duration ? ["-t", String(a.duration)] : []), "-vf", `fps=${a.fps || 15},scale=${a.width || 480}:-1:flags=lanczos`, "-loop", "0", outFile];
    case "resize": // 指定宽高
      return [...head, "-vf", `scale=${a.width || 1280}:${a.height || 720}`, "-c:a", "copy", outFile];
    case "aspect": { // 目标比例加黑边
      const w = a.width || 1920, h = a.height || 1080;
      return [...head, "-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`, "-c:a", "copy", outFile];
    }
    default:
      throw new Error(`不支持的 operation: ${op}(支持 cut/transcode/compress/extract_audio/speed/gif/resize/aspect/raw)`);
  }
}
