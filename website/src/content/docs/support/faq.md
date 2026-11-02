---
draft: false
title: FAQ
description: Frequently asked questions about ReadAny.
---

## General

### Is ReadAny free?

Yes. ReadAny is open source under the GPL-3.0 license and completely free to use.

### Does ReadAny send my data to the cloud?

No. ReadAny is local-first. Your books, annotations, and reading data are stored on your device. AI features require an API key to a provider of your choice, but the book data stays local. The semantic search embedding also runs entirely on your device.

### What languages does ReadAny support?

The interface is available in English and Chinese. Books in any language can be read. AI chat and translation support all languages provided by your AI provider.

## Books & Formats

### Can ReadAny read DRM-protected books?

No. ReadAny only supports DRM-free e-books. If your book has DRM protection, you'll need to remove it first using other tools.

### Why does my PDF look strange?

PDF is a fixed-layout format not designed for reflowable reading. ReadAny extracts the text layer from PDFs, which works well for text-heavy documents but may not preserve complex layouts, tables, or scanned pages.

### Can I convert between formats?

Format conversion (e.g., MOBI to EPUB) is planned for a future release.

## AI Features

### Do I need an API key?

For cloud AI providers (OpenAI, Anthropic, Google, DeepSeek), yes — you need your own API key. For local AI via Ollama, no API key is needed.

### What is vectorization?

Vectorization converts your book text into numerical representations (embeddings) that enable semantic search. This process runs locally on your device using your CPU and is done once per book.

### How much does AI usage cost?

ReadAny itself is free. AI API calls are billed by your provider at their standard rates. Typical book chat costs a few cents per conversation. Local AI via Ollama is completely free.

## Troubleshooting

### ReadAny won't open on macOS

If macOS blocks the app with "ReadAny is damaged" or "cannot verify developer":
1. Go to **System Settings → Privacy & Security**
2. Scroll down and click **Open Anyway**
3. Or run in Terminal: `xattr -cr /Applications/ReadAny.app`

### The AI chat is not responding

1. Check that your API key is correctly entered in **Settings → AI**
2. Verify you have a working internet connection (not needed for Ollama)
3. Try switching to a different model or provider
4. Check if your API key has available credits/quota

### Sync is not working

1. Verify your WebDAV credentials in **Settings → Sync**
2. Click **Test Connection** to check connectivity
3. Ensure your WebDAV service is accessible from your network
4. Check if the WebDAV server has enough storage space
