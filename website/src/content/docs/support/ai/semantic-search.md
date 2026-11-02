---
draft: false
title: Semantic Search
description: Find passages by meaning with AI-powered semantic search.
---

## How It Works

Traditional search finds exact keyword matches. Semantic search understands the **meaning** of your query and finds relevant passages even when the exact words don't match.

ReadAny uses a hybrid retrieval approach combining:
- **Vector similarity** — Find passages with similar meaning using embeddings
- **BM25** — Traditional keyword matching for precision

## Vectorizing a Book

Before using semantic search, you need to vectorize the book:

1. Open a book
2. Click the **vectorize** button in the sidebar (or it may start automatically)
3. Wait for the process to complete — this runs locally using your CPU

The vectorization creates a local embedding index stored on your device. This is a one-time process per book.

## Using Semantic Search

1. Open the **Search** panel in the sidebar
2. Type a natural language query (e.g., "the protagonist's childhood memories")
3. Results are ranked by semantic relevance
4. Click any result to jump to that passage

## Embedding Model

ReadAny uses [Transformers.js](https://huggingface.co/docs/transformers.js) to run embedding models locally in the browser. No data leaves your device.

You can configure the embedding model in **Settings → Vector Model**.
