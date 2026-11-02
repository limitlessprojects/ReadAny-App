---
draft: false
title: 常见问题
description: ReadAny 常见问题解答。
---

## 通用

### ReadAny 免费吗？

是的。ReadAny 基于 GPL-3.0 许可证开源，完全免费使用。

### ReadAny 会把数据上传到云端吗？

不会。ReadAny 采用本地优先策略。书籍、标注和阅读数据都存储在你的设备上。AI 功能需要你提供 API Key 连接你选择的 AI 服务，但书籍数据始终留在本地。语义搜索的 embedding 也完全在本地运行。

### ReadAny 支持哪些语言？

界面支持中文和英文。书籍内容不限语言。AI 对话和翻译支持 AI 提供商所支持的所有语言。

## 书籍与格式

### 能读有 DRM 保护的书吗？

不能。ReadAny 仅支持无 DRM 的电子书。如果你的书有 DRM 保护，需要使用其他工具先移除。

### 为什么 PDF 显示效果不理想？

PDF 是固定版式格式，不是为重排阅读设计的。ReadAny 从 PDF 中提取文本层，对于文字为主的文档效果不错，但可能无法保留复杂排版、表格或扫描页面。

### 可以格式转换吗？

格式转换（如 MOBI 转 EPUB）计划在未来版本中支持。

## AI 功能

### 需要 API Key 吗？

使用云端 AI 服务（OpenAI、Anthropic、Google、DeepSeek）需要你自己的 API Key。使用 Ollama 本地 AI 则不需要。

### 什么是向量化？

向量化将书籍文本转换为数值表示（embedding），用于语义搜索。这个过程在本地使用 CPU 运行，每本书只需执行一次。

### AI 使用费用多少？

ReadAny 本身免费。AI API 调用按提供商的标准费率计费。通常一次书籍对话花费几分钱。使用 Ollama 本地 AI 完全免费。

## 故障排除

### macOS 上无法打开 ReadAny

如果 macOS 提示「ReadAny 已损坏」或「无法验证开发者」：
1. 前往**系统设置 → 隐私与安全性**
2. 向下滚动，点击**仍要打开**
3. 或在终端执行：`xattr -cr /Applications/ReadAny.app`

### AI 对话没有响应

1. 检查**设置 → AI** 中的 API Key 是否正确
2. 确认网络连接正常（Ollama 不需要）
3. 尝试切换模型或提供商
4. 检查 API Key 是否有余额/配额

### 同步不工作

1. 在**设置 → 同步**中验证 WebDAV 凭据
2. 点击**测试连接**检查连通性
3. 确认 WebDAV 服务在当前网络可访问
4. 检查 WebDAV 服务器是否有足够存储空间
