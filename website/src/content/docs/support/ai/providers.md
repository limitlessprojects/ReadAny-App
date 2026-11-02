---
draft: false
title: AI Providers
description: Configure AI providers for chat and other AI features.
---

## Supported Providers

ReadAny supports multiple AI providers. You can use any of the following:

| Provider | Models | Notes |
|---|---|---|
| **OpenAI** | GPT-4o, GPT-4o-mini, etc. | Requires API key |
| **Anthropic** | Claude Sonnet, Claude Haiku, etc. | Requires API key |
| **Google** | Gemini Pro, Gemini Flash, etc. | Requires API key |
| **DeepSeek** | DeepSeek Chat, DeepSeek Reasoner | Requires API key |
| **Ollama** | Llama, Mistral, Qwen, etc. | Local, free, no API key needed |

## Configuration

1. Go to **Settings → AI**
2. Select your preferred provider
3. Enter your API key (not needed for Ollama)
4. Choose the model you want to use
5. Optionally set a custom API base URL

## Using Ollama (Local AI)

For fully private, offline AI:

1. Install [Ollama](https://ollama.com) on your machine
2. Pull a model: `ollama pull llama3.2`
3. In ReadAny, select **Ollama** as the provider
4. The default endpoint `http://localhost:11434` will be used automatically

## Custom API Endpoints

You can use any OpenAI-compatible API by:
1. Selecting "OpenAI" as the provider
2. Setting a custom **API Base URL** pointing to your endpoint
3. Entering the appropriate API key

This works with services like Azure OpenAI, Together AI, Groq, and self-hosted models.
