---
draft: false
title: AI 提供商
description: 配置 AI 提供商用于对话和其他 AI 功能。
---

## 支持的提供商

| 提供商 | 模型 | 说明 |
|---|---|---|
| **OpenAI** | GPT-4o、GPT-4o-mini 等 | 需要 API Key |
| **Anthropic** | Claude Sonnet、Claude Haiku 等 | 需要 API Key |
| **Google** | Gemini Pro、Gemini Flash 等 | 需要 API Key |
| **DeepSeek** | DeepSeek Chat、DeepSeek Reasoner | 需要 API Key |
| **Ollama** | Llama、Mistral、Qwen 等 | 本地运行，免费，无需 API Key |

## 配置方法

1. 进入**设置 → AI**
2. 选择你的 AI 提供商
3. 输入 API Key（Ollama 不需要）
4. 选择要使用的模型
5. 可选：设置自定义 API 地址

## 使用 Ollama（本地 AI）

完全私密的离线 AI 方案：

1. 在电脑上安装 [Ollama](https://ollama.com)
2. 拉取模型：`ollama pull llama3.2`
3. 在 ReadAny 中选择 **Ollama** 作为提供商
4. 默认端点 `http://localhost:11434` 会自动使用

## 自定义 API 端点

你可以使用任何 OpenAI 兼容的 API：
1. 选择「OpenAI」作为提供商
2. 设置自定义 **API 地址**
3. 输入对应的 API Key

适用于 Azure OpenAI、Together AI、Groq 以及自部署的模型服务。
