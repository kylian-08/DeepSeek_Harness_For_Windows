<div align="center">

# 🐋 DShHarness

**DeepSeek Harness · Windows 开箱即用封装版**

双击即用的原生桌面应用 · 专为 Windows 深度适配 · MIT 开源

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue)](https://github.com/deepseek-ai/deepseek-harness)
[![Version](https://img.shields.io/badge/Version-1.0.0-brightgreen)]()
[![dsh](https://img.shields.io/badge/dsh-0.1.0--rc.6-4D6BFE)]()

> 基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（官方开源 Agent Harness）的 Windows 桌面封装。
> **无需命令行、无需 Node.js 环境、无需科学上网**，下载安装包双击即用。

</div>

---

## ✨ 为什么选择 DShHarness

DeepSeek Harness 官方以 CLI / `npx` 方式分发，对普通 Windows 用户并不友好。DShHarness 将其**深度封装为原生 Windows 桌面应用**：

| 对比项 | 官方 dsh（CLI） | **DShHarness（本封装）** |
|---|---|---|
| 启动方式 | 打开终端输 `npx dsh web` | **双击 exe，即开即用** 🚀 |
| Node.js 环境 | 需自行安装 | **随附独立 Node 24 运行时**，零依赖 |
| 原生模块 | 依赖编译环境 | 预编译 koffi / node-pty / node:sqlite，开箱即用 |
| 窗口体验 | 浏览器标签页 | **原生窗口 + 任务栏图标** |
| 图标 | 默认样式 | **DeepSeek 官方鲸鱼图标，5 套可切换** 🎨 |
| 安装分发 | 手动配置 | **向导式 setup.exe 安装包**（可选目录 + 快捷方式 + 卸载） |
| 插件生态 | 手动装配 | **预装 flash增强 / windows增强 插件 + 运行时注入器** |
| 数据 | `~/.dsh` | **沿用同一份 `~/.dsh`**，无缝迁移 |

---

## 📸 界面预览

| 主界面 | 图标样式设置 | 预装 Agent 预设 |
|---|---|---|
| ![主界面](docs/screenshots/01-main.png) | ![图标设置](docs/screenshots/02-icon-settings.png) | ![预设菜单](docs/screenshots/03-modes.png) |

---

## 🎨 特色功能

### 1. 官方鲸鱼图标 · 5 套可切换
从 dsh 官方前端提取的 **DeepSeek 品牌鲸鱼矢量路径**，精心制作 5 套图标：

| 样式 | 说明 |
|---|---|
| 🐋 透明蓝鲸（默认） | 透明底 + 品牌蓝，任务栏/桌面都清晰 |
| ⚫️ 透明黑鲸 | 透明底 + 深灰 |
| ⬜️ 白底黑鲸 | 白底 + 深灰 |
| 🔵 白底蓝鲸 | 白底 + 品牌蓝 |
| 🌊 蓝底白鲸 | 深蓝底 + 白 |

**在设置 → 窗口图标样式中一键切换，即时生效**，重启保持，源码版与桌面版共用同一份配置。

### 2. 预装高效 Agent 预设（开箱即用，已更名中文化）

两个官方社区预装模式，**模式名 → 插件来源对应关系**：

| UI 模式名 | 插件 / 预设来源 | 核心机制 |
|---|---|---|
| **windows增强模式** | [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)（anchored-standard 预设） | 极简模式工具锚定：首请求只暴露 `bash` + `str_replace_editor`，首个工具调用后提升为完整工具集，优化 DeepSeek V4 系列在极简模式下的稳定性 |
| **flash增强模式** | [yjh051108/dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite)（router-standard 预设） | 任务感知的思维模式路由（生成任务自动 react、维护任务自动 spec、模糊任务进 weak 内路由），P1-P23 实测开放任务完成率 0% → 100% |

> 💡 提示：`dsh-routing-suite` 是「套装」——`flash增强模式` 只是其中的路由预设部分；套装还附带 **dsh-super-injector 注入器**（常驻所有模式，提供 `dev_*` 运行时插件工具），两者绑定安装、独立生效。而 `flash增强模式` 的路由机制本身构建在 `windows增强模式` 的锚定机制之上（作者明确致谢）。

### 3. 运行时插件注入器（dsh-super-injector）
BepInEx 式插件注入入口：任意本地 DSH 插件可**免重启注入**运行中的实例，自带热重载、一键自检、卸载即净、插件管理 UI。

### 4. 端口自适应
默认 `127.0.0.1:3080`；端口被占用时**自动切换随机端口**，多个实例互不冲突。

### 5. 优雅退出
关闭窗口即彻底退出应用，**自动清理后台 dsh 服务进程**，无残留。

---

## 📦 快速开始

```powershell
# 方式一：安装版（推荐）
1. 下载并运行 DShHarness-Setup-1.0.0.exe
2. 按向导安装（可自定义目录）
3. 从桌面快捷方式启动

# 方式二：便携版
解压 win-unpacked 目录，直接运行 DShHarness.exe
```

首次启动后：
1. 在 dsh 设置页配置 API Key（默认 `deepseek-v4-flash`）
2. 新建会话，可在预设菜单选择 **windows增强模式** 或 **flash增强模式**
3. 在设置 → 窗口图标样式 选择喜欢的图标

---

## 🔧 本封装相对上游的全部改动

### 桌面壳（Electron）
| 改动 | 说明 |
|---|---|
| `electron/main.js` | 新增主进程：spawn 随附 Node 运行 dsh、端口自适应、图标设置监听（`fs.watchFile` → `setIcon` 运行时切换）、优雅退出清理子进程 |
| `electron-builder.yml` | NSIS 向导安装配置（可选目录、桌面/开始菜单快捷方式、卸载程序） |
| `scripts/after-pack.js` | afterPack 钩子：把裁剪后的 dsh 应用复制进 `resources/runtime`（规避 electron-builder 复制目录丢 node_modules 的坑） |

### 图标系统
| 改动 | 说明 |
|---|---|
| `assets/deepseek-whale.svg` | 官方鲸鱼矢量路径源文件 |
| `scripts/gen-icons.js` | 从 SVG 生成 5 套多尺寸图标（16–256px PNG + ICO） |
| `assets/icons/<style>/` | 5 套图标资源（运行时切换用，打包进 `resources/runtime/icons`） |

### 壳外观插件（dsh 设置页扩展）
| 改动 | 说明 |
|---|---|
| `plugins/dshharness-shell/` | 自定义 DSH 插件：设置页新增「窗口图标样式」，5 种鲸鱼图标卡片点击切换，持久化到 `~/.dsh/storages/dshharness.json`，桌面壳监听实时生效 |
| 踩坑记录 | dsh rc.6 的 `slots.register` 需**两参调用** `register(options, component)`（单对象写法会让 component 为 undefined 导致 React #130 崩溃弃权），已按官方契约修正 |

### 构建与裁剪
| 改动 | 说明 |
|---|---|
| `scripts/stage-app.ps1` | 暂存 dsh 应用：复制 node_modules 后精确裁剪 dev 依赖（`npm ls --omit=dev` 差集）、删除 PDB/非 Windows 预编译，**555MB → 158MB** |
| `scripts/build.ps1` | 一键构建脚本（暂存 → 图标 → electron-builder），内置 npmmirror 镜像兜底 |
| 工具链离线化 | Electron 二进制、NSIS/winCodeSign/7zip 工具归档全部走镜像下载并缓存（sha256 校验），构建全程不依赖 GitHub |

### 预装插件（用户数据层，`~/.dsh`）
| 插件 | 来源 | 说明 |
|---|---|---|
| `anchored-standard` 预设 | xiaobright/dsh-anchored-standard | 两阶段工具目录锚定（UI：windows增强模式） |
| `router-standard` 预设 + 注入器 | yjh051108/dsh-routing-suite | 思维模式路由 + 运行时注入器（UI：flash增强模式） |
| `dshharness-shell` | 本项目 | 窗口图标样式设置 |

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────┐
│               DShHarness.exe (Electron)         │
│  原生窗口 · 任务栏图标 · 图标设置监听 · 进程管理    │
└──────────────┬──────────────────────────────────┘
               │ spawn（随附 node.exe）
┌──────────────▼──────────────────────────────────┐
│           dsh web 服务（127.0.0.1:3080）          │
│   Cordis 插件栈 · Web UI · 会话/工作区/模型        │
└──────────────┬──────────────────────────────────┘
               │
      ┌────────┴────────┐
      │  ~/.dsh 用户数据  │  ← 与官方 CLI 完全共用
      │  sessions/      │
      │  storages/      │  ← dshharness.json（图标样式）
      │  .agent-presets/│  ← windows增强 / flash增强 预设
      │  profiles/web/  │  ← 插件 bundle 栈
      └─────────────────┘
```

**关键设计**：dsh 服务由随附的**真实 node.exe**（非 Electron 内置 Node）运行，原生模块与 `node:sqlite` 行为和官方 CLI 完全一致；用户数据统一落在 `~/.dsh`，桌面版与官方 CLI 可**无缝交替使用、数据互通**。

---

## 🛠️ 从源码构建

```powershell
# 前置：Node.js 18+（构建机），npm
npm install
npm run build          # 或 scripts\build.ps1
# 产物：
#   dist\DShHarness-Setup-1.0.0.exe   ← 安装包
#   dist\win-unpacked\DShHarness.exe  ← 便携版
```

构建过程全自动：应用裁剪（555MB→158MB）→ 图标生成 → electron-builder 打包。网络受限时自动走 npmmirror 镜像。

---

## 📄 开源许可

本项目基于 **MIT License** 开源，详见 [LICENSE](LICENSE)。

- 上游：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）— 由 DeepSeek 官方开发
- 预装插件均为其各自作者开源（MIT / Apache-2.0），版权归原作者所有
- 鲸鱼图标矢量路径提取自 dsh 官方前端，仅作封装展示用途

```
MIT License

Copyright (c) 2026 DShHarness contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — DeepSeek 官方开源 Agent Harness
- [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard) — windows增强模式（Anchored Standard 预设）
- [yjh051108/dsh-routing-suite](https://github.com/yjh051108/dsh-routing-suite) — flash增强模式（Router Standard 预设）与注入器
- Electron / electron-builder 社区

<div align="center">

**🐋 让 DeepSeek Harness 在 Windows 上开箱即用**

</div>
