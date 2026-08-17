# windows增强模式

DSH4Win 预装的 Agent 预设之一。首次启动时由 `scripts/ensure-presets.js` 自动安装到
`~/.dsh/.agent-presets/windows-enhanced/`（dsh 用户级预设目录），无需手动装配。

## 来源

- 上游项目：[xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)（MIT）
- 取自上页 `preset/` 目录（Anchored Standard 预设），保持文件原样；
  仅修改 `preset.yml` 的显示名/描述以匹配 DSH4Win UI 文案。
- 许可证：见 `LICENSE.anchored-standard`。NOTICE：见 `NOTICE.anchored-standard`。

## 说明

- `agent.cordis.yml` 中的 `./*.mjs` 相对路径插件随预设目录一起复制，整体可移植。
- 裸包名（`@deepseek-ai/dsh-*`）由 dsh-agent-presets 从已安装的 harness 依赖闭包解析，
  无需额外安装。
