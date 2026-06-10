# MONARCH / SYSTEM — THE SHADOW CODING AGENT

<p align="center">
  <img src="../../assets/logo.svg" alt="Monarch Logo" width="400"/>
</p>

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/Stellarhold170NT/monarch?color=8b0000&labelColor=black&logo=github&style=flat-square)](https://github.com/Stellarhold170NT/monarch/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Stellarhold170NT/monarch?color=ffcb47&labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Stellarhold170NT/monarch?color=8ae8ff&labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/network/members)
[![License](https://img.shields.io/badge/license-MIT-white?labelColor=black&style=flat-square)](https://github.com/Stellarhold170NT/monarch/blob/main/LICENSE)

</div>

<p align="center">
  <a href="../../README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.vi-VN.md">Tiếng Việt</a>
</p>

先进的 AI 代理系统，实现对代码库的绝对控制，打造你发令、代码适应的快速工作流。

> 别再租用昂贵、单一的模型。受 *Solo Leveling* 启发，**Monarch** 代表着绝对权威。
>
> 你不需要臃肿的单一系统；你需要一支**影子军团**——由专精代理组成，完全听命于你。
>
> 从终端下达一条指令，看着整个开源生态对齐，征服你的代码库。

---

## 激活状态

| 状态 | 描述 |
|-------|-------------|
| **Monarch** | 完全掌控仓库。你提供高层意图；Monarch 编排执行路径。 |
| **Ruler** | 强制执行严格的代码架构、系统设计规则和清晰解耦。 |
| **System** | 将复杂功能请求拆解为原子任务并自动驱动执行。 |
| **Quicksilver** | 高速执行引擎，优化上下文窗口和令牌流，延迟极低。 |

---

## 影子军团（子代理）

| 代理 | 角色 | 简介 |
|-------|------|---------|
| **Igris** | 架构师 | 专注精确、严格的逻辑验证和干净重构。 |
| **Beru** | 自愈者 | 监控运行时执行，扫描错误日志，自动修复 bug。 |
| **Greed** | 清除引擎 | 无情删除死代码、样板和技术债务。 |

---

## OpenCode 集成

Monarch 可作为 OpenCode 插件使用。在你的项目 `opencode.json` 中添加配置：

### 通过 Git（推荐）

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "monarch@git+https://github.com/Stellarhold170NT/monarch.git"
  ]
}
```

### 通过本地路径（开发用）

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "../monarch"
  ]
}
```

在项目根目录创建或编辑 `opencode.json`，然后重启 OpenCode。Monarch 的代理（Igris、Beru、Greed）和所有技能将自动注册。
