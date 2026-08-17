# flash增强模式

DSH4Win 预装的 Agent 预设之一。首次启动时由 `scripts/ensure-presets.js` 自动安装到
`~/.dsh/.agent-presets/flash-enhanced/`（dsh 用户级预设目录），无需手动装配。

## 来源

- 上游项目：[yjh051108/dsh-router-standard](https://github.com/yjh051108/dsh-router-standard)（MIT）
- 取自上页 `preset/router-standard/` 目录（Router Standard 预设），保持文件原样；
  仅修改 `preset.yml` 的显示名/描述以匹配 DSH4Win UI 文案。
- 许可证：见 `LICENSE.router-standard`。

## 说明

- 该预设源自 `dsh-routing-suite` 套装中的 router-standard 子模块，
  其配套的 dsh-super-injector 运行时注入器不在本预设内（见 `plugins/dsh-super-injector/`）。
- 裸包名（`@deepseek-ai/dsh-*`）由 dsh-agent-presets 从已安装的 harness 依赖闭包解析，
  无需额外安装。
