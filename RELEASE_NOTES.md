# DShHarness v1.0.0 发行日志

> DeepSeek Harness 桌面封装版 —— 双击即用，无需命令行

## 版本信息

- **版本号**：v1.0.0
- **发布日期**：2026-08-15
- **适用平台**：Windows x64（Win10 / Win11）

## 这是什么

把 DeepSeek Harness（dsh）封装成原生 Windows 桌面应用：

- 双击即可启动，自带窗口，无需打开命令行
- 内置完整 dsh Web UI（与浏览器访问 `dsh web` 完全一致的能力）
- 随附独立 Node.js 24 运行时，原生模块（koffi / node-pty / node:sqlite）与命令行行为完全一致
- 用户数据沿用 `%USERPROFILE%\.dsh`，已有会话、已配置的 API Key 无缝延续

## 主要特性

- 🖥️ **完整 Web UI**：会话、工作区、模型选择、设置、详情面板等与浏览器版一致
- 📦 **向导式安装**：NSIS 安装程序，可选安装目录，自动创建桌面/开始菜单快捷方式
- 🔒 **关闭即退出**：点关闭按钮彻底退出应用，自动清理后台 dsh 服务进程，无残留
- 📝 **日志记录**：dsh 服务输出写入 `%APPDATA%\deepseek\logs\dsh.log`，便于排查
- 🧩 **端口自适应**：3080 端口被占用时自动改用随机端口，不冲突

## 本版修复

- **修复关闭按钮无法退出**：此前关闭窗口会最小化到系统托盘常驻，用户找不到托盘图标时表现为"关不掉"；现改为点击关闭按钮直接退出整个应用（含后台服务）
- **修复构建脚本路径 bug**：`npm run build` 下脚本路径解析错误导致构建失败

## 安装方式

1. 下载 `DShHarness-Setup-1.0.0.exe`
2. 双击运行，按向导安装（可选安装目录）
3. 从桌面快捷方式或开始菜单启动

> 便携版：解压 `win-unpacked.zip` 后直接运行 `DShHarness.exe` 亦可。

## 文件校验

| 文件 | 大小 | SHA-256 |
|---|---|---|
| DShHarness-Setup-1.0.0.exe | 159.9 MB | `7f588e0cc7d71bc8622b46e13bfdb96269bb69a0b8036704dacc878db9edb83f` |

## 已知限制

- **无代码签名**：安装包未经代码签名，Windows SmartScreen 可能提示"未知发布者"，点击"更多信息 → 仍要运行"即可
- **体积较大**（~160MB）：Electron 自带完整浏览器内核 + 独立 Node 运行时的代价；解压后约 548MB
- **暂不提供**：自动更新、Linux/macOS 版本、局域网多设备访问

## 致谢与相关链接

- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness
