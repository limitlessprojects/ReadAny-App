# ReadAny - 格式转 EPUB 技术方案

## 一、背景与目标

ReadAny 当前已支持 EPUB/MOBI/AZW/AZW3/FB2/FBZ/CBZ/PDF 等多格式的**运行时解析与阅读**，但缺少**格式间转换**能力。本方案旨在实现「任意已支持格式 → EPUB」的转换功能，覆盖桌面端（Tauri WebView）、移动端（Expo React Native）和 Tauri Mobile 三个平台。

### 1.1 项目现有能力

| 能力 | 现状 | 关键代码 |
|---|---|---|
| 格式检测与解析 | `DocumentLoader` 通过 magic bytes 识别格式，分发至 foliate-js 各解析器 | `packages/app/src/lib/reader/document-loader.ts` |
| EPUB 解析 | 完整的 OPF/NCX/NAV/CFI 解析，提取 metadata、TOC、sections | `packages/foliate-js/epub.js` |
| MOBI/KF8 解析 | PalmDOC/Huffman/KF8 二进制解析，输出 HTML sections | `packages/foliate-js/mobi.js` |
| FB2 解析 | XML 解析 + `FB2Converter` 转 HTML | `packages/foliate-js/fb2.js` |
| CBZ 解析 | ZIP 解压 → 图片列表 → HTML 图片页 | `packages/foliate-js/comic-book.js` |
| PDF 渲染 | pdfjs-dist 渲染 + 文本层提取 | `packages/foliate-js/pdf.js` |
| 文本提取 (RAG) | 遍历 sections → `createDocument()` → DOM 文本提取 | `packages/app/src/lib/rag/book-extractor.ts` |
| 标注导出 | 跨平台文件输出模式 (IPlatformService) | `packages/core/src/export/annotation-exporter.ts` |
| ZIP 读写 | `@zip.js/zip.js` (含 ZipWriter，但当前仅用了 ZipReader) | `packages/foliate-js/vendor/zip.js` |
| RN ↔ WebView 通信 | base64 文件传输 + postMessage 消息桥 | `packages/app-expo/src/hooks/use-reader-bridge.ts` |

### 1.2 核心思路

```
源文件 (任意格式)
  → [Format Parser] 提取 HTML sections + metadata + TOC + cover
  → [HTML Normalizer] 规范化 XHTML、提取/内联图片、拆分章节
  → [EPUB Builder] 生成 EPUB 3 文件结构，用 ZipWriter 打包
  → [Platform Output] 通过 IPlatformService 写文件/分享
```

关键决策：**不引入 Pandoc WASM (16MB) 或 Calibre 等重型依赖**，而是基于已有的 foliate-js 解析能力 + `@zip.js/zip.js` 的 ZipWriter 自建轻量 EPUB Builder，仅新增 `mammoth.js` (~200KB) 用于 DOCX 支持。

---

## 二、整体架构

### 2.1 模块分层

```
packages/core/src/convert/
├── epub-builder.ts          # EPUB 3 文件打包器（核心）
├── convert-service.ts       # 转换服务入口（调度各解析器 + 调用 builder）
├── types.ts                 # 转换相关类型定义
├── parsers/
│   ├── html-parser.ts       # HTML/网页 → 章节
│   ├── markdown-parser.ts   # Markdown/TXT → 章节
│   ├── docx-parser.ts       # DOCX → 章节 (mammoth.js)
│   ├── pdf-parser.ts        # PDF → 章节 (pdfjs-dist 文本提取)
│   └── book-parser.ts       # MOBI/FB2/CBZ → 章节 (复用 foliate-js)
└── utils/
    ├── html-normalizer.ts   # HTML → XHTML 规范化
    └── image-extractor.ts   # 从 HTML 中提取/内联图片
```

### 2.2 数据流

```
                    ┌──────────────────────────────────────────────────┐
                    │              ConvertService                      │
                    │  convert(file: File, options?) → Promise<Blob>   │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │         Format Detection & Parse                 │
                    │                                                   │
                    │  .docx → DocxParser     (mammoth.js)             │
                    │  .md   → MarkdownParser (marked)                 │
                    │  .txt  → MarkdownParser (纯文本模式)              │
                    │  .html → HtmlParser     (DOM 解析)               │
                    │  .mobi/.azw/.azw3 → BookParser (foliate-js)      │
                    │  .fb2/.fbz → BookParser (foliate-js)             │
                    │  .cbz  → BookParser     (foliate-js)             │
                    │  .pdf  → PdfParser      (pdfjs-dist)             │
                    │                                                   │
                    │  输出: ConvertResult {                            │
                    │    metadata: EpubMetadata                         │
                    │    chapters: Chapter[]                            │
                    │    cover?: Blob                                   │
                    │    resources: Resource[]                          │
                    │  }                                                │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │           EPUB Builder                            │
                    │                                                   │
                    │  1. 生成 mimetype                                 │
                    │  2. 生成 META-INF/container.xml                   │
                    │  3. 生成 OEBPS/content.opf                        │
                    │  4. 生成 OEBPS/nav.xhtml                          │
                    │  5. 生成 OEBPS/toc.ncx (兼容 EPUB 2)              │
                    │  6. 写入 OEBPS/chapter-*.xhtml                    │
                    │  7. 写入 OEBPS/images/*                           │
                    │  8. 写入 OEBPS/style.css                          │
                    │  9. ZipWriter 打包 → Blob                         │
                    └──────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────────────────────────┐
                    │           Platform Output                        │
                    │                                                   │
                    │  Desktop:  IPlatformService.writeFile(path, data) │
                    │  RN:       WebView → base64 → postMessage → RN   │
                    │            → expo-file-system.writeAsStringAsync  │
                    │  Tauri M:  同 Desktop                             │
                    └─────────────────────────────────────────────────┘
```

---

## 三、核心类型定义

```typescript
// packages/core/src/convert/types.ts

/** EPUB 元数据 */
export interface EpubMetadata {
  title: string;
  author: string;
  language?: string;          // 默认 'en'
  identifier?: string;        // UUID，自动生成
  publisher?: string;
  description?: string;
  date?: string;              // ISO 8601
  subjects?: string[];
  cover?: Blob | null;
}

/** 章节内容 */
export interface Chapter {
  id: string;                 // 'chapter-1', 'chapter-2', ...
  title: string;              // 章节标题
  content: string;            // XHTML 内容（<body> 内部的 HTML）
  level?: number;             // 标题层级 (1-6)，用于 TOC 层级
}

/** 资源文件（图片、字体等） */
export interface Resource {
  id: string;                 // 'img-001', 'font-001', ...
  href: string;               // 'images/img-001.jpg'
  mediaType: string;          // 'image/jpeg'
  data: Blob | Uint8Array;    // 二进制数据
  properties?: string;        // 'cover-image' 等
}

/** 转换中间结果 */
export interface ConvertResult {
  metadata: EpubMetadata;
  chapters: Chapter[];
  resources: Resource[];
}

/** 转换配置选项 */
export interface ConvertOptions {
  /** 自定义标题（覆盖原文件标题） */
  title?: string;
  /** 自定义作者 */
  author?: string;
  /** 自定义语言代码 */
  language?: string;
  /** 自定义封面图片 */
  cover?: Blob;
  /** 自定义 CSS */
  css?: string;
  /** 章节拆分策略 (仅对 HTML/TXT 生效) */
  splitStrategy?: 'heading' | 'pagebreak' | 'none';
  /** PDF 专用：是否尝试提取图片 */
  pdfExtractImages?: boolean;
}

/** 支持转换的源格式 */
export type ConvertibleFormat =
  | 'docx' | 'md' | 'txt' | 'html'
  | 'mobi' | 'azw' | 'azw3'
  | 'fb2' | 'fbz'
  | 'cbz'
  | 'pdf';
```

---

## 四、EPUB Builder 详细设计

### 4.1 核心类

```typescript
// packages/core/src/convert/epub-builder.ts

import { configure, ZipWriter, BlobWriter, BlobReader, TextReader }
  from '@zip.js/zip.js';

export class EpubBuilder {
  private metadata: EpubMetadata;
  private chapters: Chapter[];
  private resources: Resource[];
  private css: string;

  constructor(result: ConvertResult, options?: { css?: string }) {
    this.metadata = result.metadata;
    this.chapters = result.chapters;
    this.resources = result.resources;
    this.css = options?.css ?? DEFAULT_CSS;
  }

  /** 生成 EPUB 文件，返回 Blob */
  async build(): Promise<Blob> {
    configure({ useWebWorkers: false });
    const blobWriter = new BlobWriter('application/epub+zip');
    const zipWriter = new ZipWriter(blobWriter);

    // 1. mimetype (必须第一个，不压缩)
    await zipWriter.add('mimetype',
      new TextReader('application/epub+zip'),
      { level: 0 }  // store, no compression
    );

    // 2. META-INF/container.xml
    await zipWriter.add('META-INF/container.xml',
      new TextReader(this.generateContainerXml())
    );

    // 3. OEBPS/content.opf
    await zipWriter.add('OEBPS/content.opf',
      new TextReader(this.generateContentOpf())
    );

    // 4. OEBPS/nav.xhtml (EPUB 3 导航)
    await zipWriter.add('OEBPS/nav.xhtml',
      new TextReader(this.generateNavXhtml())
    );

    // 5. OEBPS/toc.ncx (EPUB 2 兼容)
    await zipWriter.add('OEBPS/toc.ncx',
      new TextReader(this.generateTocNcx())
    );

    // 6. OEBPS/style.css
    await zipWriter.add('OEBPS/style.css',
      new TextReader(this.css)
    );

    // 7. 章节 XHTML 文件
    for (const chapter of this.chapters) {
      await zipWriter.add(
        `OEBPS/${chapter.id}.xhtml`,
        new TextReader(this.wrapChapterXhtml(chapter))
      );
    }

    // 8. 资源文件（图片等）
    for (const resource of this.resources) {
      const blob = resource.data instanceof Blob
        ? resource.data
        : new Blob([resource.data], { type: resource.mediaType });
      await zipWriter.add(
        `OEBPS/${resource.href}`,
        new BlobReader(blob)
      );
    }

    await zipWriter.close();
    return blobWriter.getData();
  }
}
```

### 4.2 XML 模板生成

#### container.xml

```typescript
private generateContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}
```

#### content.opf

```typescript
private generateContentOpf(): string {
  const { title, author, language, identifier, publisher, description, date, subjects } =
    this.metadata;
  const uid = identifier || `urn:uuid:${crypto.randomUUID()}`;
  const lang = language || 'en';
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  // manifest items
  const manifestItems: string[] = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="css" href="style.css" media-type="text/css"/>`,
  ];

  for (const ch of this.chapters) {
    manifestItems.push(
      `    <item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`
    );
  }

  for (const res of this.resources) {
    const props = res.properties ? ` properties="${res.properties}"` : '';
    manifestItems.push(
      `    <item id="${res.id}" href="${res.href}" media-type="${res.mediaType}"${props}/>`
    );
  }

  // spine itemrefs
  const spineItems = this.chapters
    .map(ch => `    <itemref idref="${ch.id}"/>`)
    .join('\n');

  // metadata
  const metaLines = [
    `    <dc:identifier id="BookId">${this.escapeXml(uid)}</dc:identifier>`,
    `    <dc:title>${this.escapeXml(title)}</dc:title>`,
    `    <dc:language>${lang}</dc:language>`,
    `    <dc:creator>${this.escapeXml(author)}</dc:creator>`,
    `    <meta property="dcterms:modified">${modified}</meta>`,
  ];
  if (publisher) metaLines.push(`    <dc:publisher>${this.escapeXml(publisher)}</dc:publisher>`);
  if (description) metaLines.push(`    <dc:description>${this.escapeXml(description)}</dc:description>`);
  if (date) metaLines.push(`    <dc:date>${date}</dc:date>`);
  if (subjects) {
    for (const s of subjects) {
      metaLines.push(`    <dc:subject>${this.escapeXml(s)}</dc:subject>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         version="3.0"
         unique-identifier="BookId">
  <metadata>
${metaLines.join('\n')}
  </metadata>
  <manifest>
${manifestItems.join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`;
}
```

#### nav.xhtml (EPUB 3 导航)

```typescript
private generateNavXhtml(): string {
  const tocItems = this.chapters
    .map(ch => `      <li><a href="${ch.id}.xhtml">${this.escapeXml(ch.title)}</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${this.metadata.language || 'en'}">
  <head>
    <title>Table of Contents</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>Table of Contents</h1>
      <ol>
${tocItems}
      </ol>
    </nav>
  </body>
</html>`;
}
```

#### toc.ncx (EPUB 2 兼容)

```typescript
private generateTocNcx(): string {
  const uid = this.metadata.identifier || '';
  const navPoints = this.chapters
    .map((ch, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${this.escapeXml(ch.title)}</text></navLabel>
      <content src="${ch.id}.xhtml"/>
    </navPoint>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${this.escapeXml(uid)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${this.escapeXml(this.metadata.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}
```

#### 章节 XHTML 包装

```typescript
private wrapChapterXhtml(chapter: Chapter): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:epub="http://www.idpf.org/2007/ops"
      xml:lang="${this.metadata.language || 'en'}">
  <head>
    <title>${this.escapeXml(chapter.title)}</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
  </head>
  <body>
    <section epub:type="chapter" role="doc-chapter">
      <h1>${this.escapeXml(chapter.title)}</h1>
      ${chapter.content}
    </section>
  </body>
</html>`;
}
```

### 4.3 默认 CSS

```css
const DEFAULT_CSS = `
body {
  font-family: serif;
  line-height: 1.6;
  margin: 1em;
  text-align: justify;
}
h1, h2, h3, h4, h5, h6 {
  font-family: sans-serif;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  text-align: left;
}
h1 { font-size: 1.6em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; }
p { margin: 0.5em 0; text-indent: 2em; }
img { max-width: 100%; height: auto; }
blockquote {
  margin: 1em 2em;
  font-style: italic;
  border-left: 3px solid #ccc;
  padding-left: 1em;
}
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid #ccc; padding: 0.5em; }
code { font-family: monospace; background: #f4f4f4; padding: 0.2em 0.4em; }
pre { background: #f4f4f4; padding: 1em; overflow-x: auto; white-space: pre-wrap; }
`;
```

---

## 五、各格式解析器详细设计

### 5.1 BookParser — MOBI/AZW/AZW3/FB2/FBZ/CBZ

复用已有的 foliate-js 解析器，通过 `DocumentLoader` 打开文件后遍历 sections。

```typescript
// packages/core/src/convert/parsers/book-parser.ts

/**
 * 复用 foliate-js 解析能力，将 MOBI/FB2/CBZ 等格式提取为 Chapter[]
 *
 * 核心逻辑参考: packages/app/src/lib/rag/book-extractor.ts
 * 关键调用链: DocumentLoader.open() → book.sections[i].createDocument() → DOM Document
 */
export class BookParser {
  async parse(file: File): Promise<ConvertResult> {
    const loader = new DocumentLoader(file);
    const { book, format } = await loader.open();

    // 1. 提取 metadata
    const metadata = this.extractMetadata(book.metadata);

    // 2. 提取封面
    const cover = await book.getCover?.();

    // 3. 构建 TOC 映射 (section index → title)
    const tocMap = this.buildTocMap(book.toc ?? []);

    // 4. 遍历 sections，提取 HTML 内容
    const chapters: Chapter[] = [];
    const resources: Resource[] = [];
    const sections = book.sections ?? [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section.createDocument) continue;

      const doc = await section.createDocument();
      const body = doc.body;
      if (!body || !body.innerHTML.trim()) continue;

      // 提取并收集图片
      const images = await this.extractImages(doc, book, i);
      resources.push(...images);

      // 替换图片 src 为相对路径
      this.rewriteImageSrcs(doc, images);

      // 清理不需要的元素 (script, style 等)
      this.cleanDocument(doc);

      const title = tocMap.get(i) ?? `Chapter ${i + 1}`;
      const content = body.innerHTML;

      chapters.push({
        id: `chapter-${i + 1}`,
        title,
        content,
      });
    }

    // 5. 添加封面资源
    if (cover) {
      const coverType = cover.type || 'image/jpeg';
      const ext = coverType.includes('png') ? 'png' : 'jpg';
      resources.push({
        id: 'cover-image',
        href: `images/cover.${ext}`,
        mediaType: coverType,
        data: cover,
        properties: 'cover-image',
      });
    }

    return { metadata, chapters, resources };
  }
}
```

**可复用的已有代码**：
- `DocumentLoader` (`packages/app/src/lib/reader/document-loader.ts`): 格式检测 + foliate-js 分发
- `extractBookChapters()` (`packages/app/src/lib/rag/book-extractor.ts`): section 遍历模式
- `buildTocMap()` (`packages/app/src/lib/rag/book-extractor.ts`): TOC → section index 映射

**注意**：`DocumentLoader` 当前位于 `packages/app/`（桌面端专用），需要将其核心逻辑提取到 `packages/core/` 或直接在转换逻辑中使用 foliate-js API。

### 5.2 DocxParser — DOCX

```typescript
// packages/core/src/convert/parsers/docx-parser.ts

import mammoth from 'mammoth';

/**
 * 使用 mammoth.js 将 DOCX 转换为 HTML，然后拆分为章节
 *
 * mammoth.js 特点：
 * - ~200KB，纯 JS，browser/WebView 兼容
 * - 语义化转换：保留标题、列表、表格、图片、加粗斜体
 * - 自动提取内嵌图片为 base64 data URI
 */
export class DocxParser {
  async parse(file: File): Promise<ConvertResult> {
    const arrayBuffer = await file.arrayBuffer();

    // mammoth 转换
    const result = await mammoth.convertToHtml(
      { arrayBuffer },
      {
        // 图片处理：转为 data URI（后续由 image-extractor 提取）
        convertImage: mammoth.images.imgElement((image) => {
          return image.read('base64').then((imageBuffer) => ({
            src: `data:${image.contentType};base64,${imageBuffer}`,
          }));
        }),
      }
    );

    const html = result.value;  // 完整的 HTML 字符串

    // 按 h1/h2 标签拆分章节
    const chapters = this.splitByHeadings(html);

    // 提取图片资源
    const resources = this.extractDataUriImages(html);

    // 从文件名推断标题
    const title = file.name.replace(/\.docx$/i, '');

    return {
      metadata: { title, author: '' },
      chapters,
      resources,
    };
  }

  /** 按 <h1>/<h2> 标签拆分 HTML 为多个章节 */
  private splitByHeadings(html: string): Chapter[] {
    // 用正则或 DOMParser 在 <h1>/<h2> 处拆分
    // 如果没有标题标签，整体作为一个章节
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    const body = doc.body.firstElementChild!;

    const chapters: Chapter[] = [];
    let currentTitle = 'Untitled';
    let currentContent = '';
    let chapterIndex = 0;

    for (const node of Array.from(body.childNodes)) {
      if (node instanceof HTMLElement && /^H[12]$/i.test(node.tagName)) {
        // 保存前一章节
        if (currentContent.trim()) {
          chapters.push({
            id: `chapter-${++chapterIndex}`,
            title: currentTitle,
            content: currentContent,
          });
        }
        currentTitle = node.textContent?.trim() || `Chapter ${chapterIndex + 1}`;
        currentContent = '';
      } else if (node instanceof HTMLElement) {
        currentContent += node.outerHTML;
      }
    }

    // 最后一个章节
    if (currentContent.trim()) {
      chapters.push({
        id: `chapter-${++chapterIndex}`,
        title: currentTitle,
        content: currentContent,
      });
    }

    // 如果完全没有拆分，将全部内容作为一个章节
    if (chapters.length === 0) {
      chapters.push({
        id: 'chapter-1',
        title: 'Content',
        content: html,
      });
    }

    return chapters;
  }
}
```

### 5.3 MarkdownParser — Markdown / TXT

```typescript
// packages/core/src/convert/parsers/markdown-parser.ts

import { marked } from 'marked';

/**
 * 将 Markdown 或纯文本转换为 EPUB 章节
 *
 * 可复用: packages/app 中已有 marked (v17) 依赖
 */
export class MarkdownParser {
  async parse(file: File, isTxt: boolean = false): Promise<ConvertResult> {
    let text = await file.text();

    if (isTxt) {
      // 纯文本模式：将段落包装为 HTML
      text = this.txtToMarkdown(text);
    }

    const html = await marked.parse(text);

    // 按 ## 标题拆分章节
    const chapters = this.splitByHeadings(text, html);

    // 提取标题（第一个 # 标题或文件名）
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch?.[1] || file.name.replace(/\.(md|txt|markdown)$/i, '');

    return {
      metadata: { title, author: '' },
      chapters,
      resources: [],
    };
  }

  /** 纯文本转 Markdown：按空行分段，检测常见章节模式 */
  private txtToMarkdown(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];

    for (const line of lines) {
      // 检测中文章节标题模式：第X章、第X节 等
      if (/^第[一二三四五六七八九十百千万\d]+[章节篇卷回]/.test(line.trim())) {
        result.push(`\n## ${line.trim()}\n`);
      }
      // 检测英文章节标题模式：Chapter X, CHAPTER X 等
      else if (/^(chapter|part|section|book)\s+\d+/i.test(line.trim())) {
        result.push(`\n## ${line.trim()}\n`);
      }
      else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /** 按 Markdown 一级/二级标题拆分为章节 */
  private splitByHeadings(markdown: string, fullHtml: string): Chapter[] {
    // 用正则提取所有 ## 标题的位置
    const headingRegex = /^#{1,2}\s+(.+)$/gm;
    const headings: { title: string; index: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push({ title: match[1], index: match.index });
    }

    if (headings.length === 0) {
      return [{
        id: 'chapter-1',
        title: 'Content',
        content: fullHtml,
      }];
    }

    // 按标题位置拆分 Markdown，分段渲染为 HTML
    const chapters: Chapter[] = [];
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index;
      const end = i + 1 < headings.length ? headings[i + 1].index : markdown.length;
      const section = markdown.substring(start, end);
      const sectionHtml = marked.parse(section) as string;

      chapters.push({
        id: `chapter-${i + 1}`,
        title: headings[i].title,
        content: sectionHtml,
      });
    }

    return chapters;
  }
}
```

### 5.4 PdfParser — PDF

```typescript
// packages/core/src/convert/parsers/pdf-parser.ts

/**
 * 使用 pdfjs-dist 从 PDF 中提取文本，转换为 EPUB 章节
 *
 * 可复用:
 * - packages/app 中已有 pdfjs-dist (v5.4) 依赖
 * - packages/app/src/lib/rag/book-extractor.ts 的 extractPdfChapters()
 *
 * 注意: PDF→EPUB 是"重排"转换，效果取决于 PDF 类型：
 * - 纯文字 PDF：效果可接受
 * - 扫描 PDF：需要 OCR，本方案不覆盖
 * - 复杂排版 PDF：格式损失较大
 */
export class PdfParser {
  async parse(file: File): Promise<ConvertResult> {
    const { getDocument } = await import('pdfjs-dist');
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;

    const totalPages = pdf.numPages;
    const chapters: Chapter[] = [];
    let currentChapterPages: string[] = [];
    let currentTitle = 'Chapter 1';
    let chapterIndex = 0;

    // 获取 outline (目录) 用于智能章节拆分
    const outline = await pdf.getOutline();
    const outlineDestinations = await this.resolveOutlinePages(pdf, outline);

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => item.str)
        .join(' ');

      // 检查是否到达新章节边界
      const outlineEntry = outlineDestinations.find(d => d.pageNum === pageNum);
      if (outlineEntry && currentChapterPages.length > 0) {
        chapters.push({
          id: `chapter-${++chapterIndex}`,
          title: currentTitle,
          content: currentChapterPages
            .map(t => `<p>${this.escapeHtml(t)}</p>`)
            .join('\n'),
        });
        currentChapterPages = [];
        currentTitle = outlineEntry.title;
      }

      if (text.trim()) {
        currentChapterPages.push(text);
      }
    }

    // 最后一章
    if (currentChapterPages.length > 0) {
      chapters.push({
        id: `chapter-${++chapterIndex}`,
        title: currentTitle,
        content: currentChapterPages
          .map(t => `<p>${this.escapeHtml(t)}</p>`)
          .join('\n'),
      });
    }

    // 如果没有 outline，按固定页数拆分
    if (chapters.length === 0) {
      chapters.push({
        id: 'chapter-1',
        title: file.name.replace(/\.pdf$/i, ''),
        content: '<p>No extractable text found in this PDF.</p>',
      });
    }

    return {
      metadata: {
        title: (await pdf.getMetadata())?.info?.Title
          || file.name.replace(/\.pdf$/i, ''),
        author: (await pdf.getMetadata())?.info?.Author || '',
      },
      chapters,
      resources: [],
    };
  }
}
```

### 5.5 HtmlParser — HTML/网页

```typescript
// packages/core/src/convert/parsers/html-parser.ts

/**
 * 将 HTML 文件/网页内容转换为 EPUB 章节
 * 直接解析 DOM，提取正文内容
 */
export class HtmlParser {
  async parse(file: File): Promise<ConvertResult> {
    const html = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 提取标题
    const title = doc.querySelector('title')?.textContent
      || doc.querySelector('h1')?.textContent
      || file.name.replace(/\.html?$/i, '');

    // 提取正文 (优先 <article>/<main>, 回退 <body>)
    const body = doc.querySelector('article')
      || doc.querySelector('main')
      || doc.querySelector('.content')
      || doc.body;

    // 移除不需要的元素
    body.querySelectorAll('script, style, nav, header, footer, aside, iframe, noscript')
      .forEach(el => el.remove());

    // 按 h1/h2 拆分
    const chapters = this.splitByHeadings(body);

    // 提取图片
    const resources = await this.extractImages(doc);

    return {
      metadata: { title, author: '' },
      chapters,
      resources,
    };
  }
}
```

---

## 六、ConvertService — 转换服务入口

```typescript
// packages/core/src/convert/convert-service.ts

export class ConvertService {
  /**
   * 将文件转换为 EPUB 格式
   * @param file 源文件
   * @param options 转换选项
   * @returns EPUB 文件 Blob
   */
  async convertToEpub(file: File, options?: ConvertOptions): Promise<Blob> {
    // 1. 检测格式
    const format = this.detectFormat(file);

    // 2. 根据格式选择解析器
    let result: ConvertResult;
    switch (format) {
      case 'docx':
        result = await new DocxParser().parse(file);
        break;
      case 'md':
      case 'txt':
        result = await new MarkdownParser().parse(file, format === 'txt');
        break;
      case 'html':
        result = await new HtmlParser().parse(file);
        break;
      case 'pdf':
        result = await new PdfParser().parse(file);
        break;
      case 'mobi':
      case 'azw':
      case 'azw3':
      case 'fb2':
      case 'fbz':
      case 'cbz':
        result = await new BookParser().parse(file);
        break;
      default:
        throw new Error(`Unsupported format for conversion: ${format}`);
    }

    // 3. 应用用户自定义选项
    if (options?.title) result.metadata.title = options.title;
    if (options?.author) result.metadata.author = options.author;
    if (options?.language) result.metadata.language = options.language;
    if (options?.cover) {
      const ext = options.cover.type.includes('png') ? 'png' : 'jpg';
      result.resources = result.resources.filter(r => r.properties !== 'cover-image');
      result.resources.push({
        id: 'cover-image',
        href: `images/cover.${ext}`,
        mediaType: options.cover.type,
        data: options.cover,
        properties: 'cover-image',
      });
    }

    // 4. 构建 EPUB
    const builder = new EpubBuilder(result, { css: options?.css });
    return builder.build();
  }

  /** 根据文件扩展名和 magic bytes 检测格式 */
  private detectFormat(file: File): ConvertibleFormat {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const formatMap: Record<string, ConvertibleFormat> = {
      docx: 'docx',
      md: 'md', markdown: 'md',
      txt: 'txt', text: 'txt',
      html: 'html', htm: 'html', xhtml: 'html',
      mobi: 'mobi',
      azw: 'azw', azw3: 'azw3',
      fb2: 'fb2', fbz: 'fbz',
      cbz: 'cbz',
      pdf: 'pdf',
    };
    const format = formatMap[ext ?? ''];
    if (!format) throw new Error(`Unknown file extension: .${ext}`);
    return format;
  }
}

/** 单例导出 */
export const convertService = new ConvertService();
```

---

## 七、平台适配

### 7.1 Tauri 桌面端 (WebView)

最简单的场景，转换逻辑直接在 WebView 中运行。

```typescript
// packages/app/src/lib/convert/index.ts

import { convertService } from '@readany/core/convert';
import { writeFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';

export async function convertFileToEpub(filePath: string) {
  // 1. 读取文件
  const response = await fetch(convertFileSrc(filePath));
  const blob = await response.blob();
  const file = new File([blob], getFileName(filePath));

  // 2. 转换
  const epubBlob = await convertService.convertToEpub(file);

  // 3. 让用户选择保存位置
  const outputPath = await save({
    filters: [{ name: 'EPUB', extensions: ['epub'] }],
    defaultPath: file.name.replace(/\.[^.]+$/, '.epub'),
  });

  if (outputPath) {
    const buffer = await epubBlob.arrayBuffer();
    await writeFile(outputPath, new Uint8Array(buffer));
  }
}
```

### 7.2 Expo React Native (WebView Bridge)

需要通过 WebView 执行转换，因为 mammoth.js、DOMParser 等依赖浏览器环境。

```typescript
// packages/app-expo/src/lib/convert/convert-bridge.ts

/**
 * 在 WebView 中执行格式转换
 *
 * 通信模式复用 use-reader-bridge.ts 的 base64 文件传输模式:
 * RN → WebView: base64 文件数据
 * WebView → RN: base64 EPUB 数据
 */
export function useConvertBridge(webViewRef: RefObject<WebView>) {
  const convertToEpub = async (filePath: string): Promise<string> => {
    // 1. 读取文件为 base64
    const base64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileName = filePath.split('/').pop() || 'file';

    // 2. 发送到 WebView 执行转换
    return new Promise((resolve, reject) => {
      const handler = (event: { nativeEvent: { data: string } }) => {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'convertResult') {
          resolve(msg.base64);  // EPUB 的 base64 数据
        } else if (msg.type === 'convertError') {
          reject(new Error(msg.error));
        }
      };

      // 注入转换指令
      webViewRef.current?.injectJavaScript(`
        (async () => {
          try {
            const base64 = '${base64}';
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const file = new File([bytes], '${fileName}');

            const { convertService } = await import('./convert-service.js');
            const epubBlob = await convertService.convertToEpub(file);

            const reader = new FileReader();
            reader.onload = () => {
              const epubBase64 = reader.result.split(',')[1];
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'convertResult',
                base64: epubBase64,
              }));
            };
            reader.readAsDataURL(epubBlob);
          } catch (e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'convertError',
              error: e.message,
            }));
          }
        })();
        true;
      `);
    });
  };

  const saveEpub = async (base64Data: string, outputFileName: string) => {
    const outputPath = FileSystem.documentDirectory + outputFileName;
    await FileSystem.writeAsStringAsync(outputPath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outputPath;
  };

  return { convertToEpub, saveEpub };
}
```

### 7.3 Tauri Mobile

与桌面端相同，转换逻辑在 WebView 中直接运行，通过 Tauri plugin-fs 写文件。

### 7.4 平台差异总结

| 能力 | Tauri Desktop | Expo RN | Tauri Mobile |
|---|---|---|---|
| DOMParser | WebView 原生 | WebView 内 | WebView 原生 |
| @zip.js/zip.js | 直接 import | WebView 内打包 | 直接 import |
| mammoth.js | 直接 import | WebView 内打包 | 直接 import |
| marked | 已有依赖 | WebView 内打包 | 已有依赖 |
| pdfjs-dist | 已有依赖 | WebView 内使用 | 已有依赖 |
| 文件读取 | tauri-plugin-fs | expo-file-system → base64 → WebView | tauri-plugin-fs |
| 文件写入 | tauri-plugin-fs + dialog | base64 → expo-file-system | tauri-plugin-fs |
| foliate-js | 已有 | WebView 内已有 | 已有 |

---

## 八、HTML 规范化工具

```typescript
// packages/core/src/convert/utils/html-normalizer.ts

/**
 * 将 HTML 内容规范化为有效的 EPUB XHTML
 *
 * EPUB 3 要求内容文档符合 XHTML 语法，主要处理：
 * 1. 自闭合标签 (<br> → <br/>)
 * 2. 属性引号 (checked → checked="checked")
 * 3. 移除不安全元素 (script, form, iframe 等)
 * 4. 图片 src 路径修正
 */
export function normalizeHtml(html: string): string {
  // 自闭合标签修正
  html = html.replace(/<(br|hr|img|input|meta|link)([^>]*?)(?<!\/)>/gi,
    '<$1$2/>');

  // 移除 HTML5 布尔属性的简写形式
  html = html.replace(/\s(checked|disabled|selected|readonly|required)(?=[>\s])/gi,
    ' $1="$1"');

  // 移除不安全的元素和属性
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  html = html.replace(/<form[\s\S]*?<\/form>/gi, '');
  html = html.replace(/\son\w+="[^"]*"/gi, '');  // onclick, onload 等

  return html;
}
```

---

## 九、图片提取工具

```typescript
// packages/core/src/convert/utils/image-extractor.ts

/**
 * 从 HTML 内容中提取图片资源
 *
 * 处理两种情况：
 * 1. data: URI → 提取为独立文件
 * 2. blob: URL → 通过 fetch 获取
 * 3. 远程 URL → 保持原样（EPUB 不支持远程资源，需嵌入）
 */
export async function extractImages(
  doc: Document,
  prefix: string = ''
): Promise<{ resources: Resource[]; replacements: Map<string, string> }> {
  const resources: Resource[] = [];
  const replacements = new Map<string, string>();
  const imgs = doc.querySelectorAll('img[src]');
  let imgIndex = 0;

  for (const img of Array.from(imgs)) {
    const src = img.getAttribute('src');
    if (!src) continue;

    let blob: Blob | null = null;
    let ext = 'jpg';

    if (src.startsWith('data:')) {
      // data URI → 解码
      const match = src.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const base64 = match[2];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        blob = new Blob([bytes], { type: mimeType });
        ext = mimeType.includes('png') ? 'png'
            : mimeType.includes('gif') ? 'gif'
            : mimeType.includes('svg') ? 'svg'
            : mimeType.includes('webp') ? 'webp'
            : 'jpg';
      }
    } else if (src.startsWith('blob:')) {
      try {
        const response = await fetch(src);
        blob = await response.blob();
        ext = blob.type.includes('png') ? 'png' : 'jpg';
      } catch { /* ignore */ }
    }

    if (blob) {
      imgIndex++;
      const id = `${prefix}img-${imgIndex}`;
      const href = `images/${id}.${ext}`;
      resources.push({
        id,
        href,
        mediaType: blob.type || `image/${ext}`,
        data: blob,
      });
      replacements.set(src, href);
    }
  }

  return { resources, replacements };
}
```

---

## 十、新增依赖评估

| 依赖 | 版本 | 大小 | 用途 | 安装范围 | 是否必须 |
|---|---|---|---|---|---|
| **mammoth** | ^1.8 | ~200KB | DOCX → HTML 转换 | `packages/core` | 需要 DOCX 支持时必须 |
| `@zip.js/zip.js` | ^2.7.52 | **已有** | ZIP 写入 (ZipWriter) | 已在 `packages/app` | 已有，仅需新增 import |
| `marked` | ^17.0 | **已有** | Markdown → HTML | 已在 `packages/app` | 已有 |
| `pdfjs-dist` | ^5.4 | **已有** | PDF 文本提取 | 已在 `packages/app` | 已有 |
| foliate-js | workspace | **已有** | MOBI/FB2/CBZ 解析 | workspace 依赖 | 已有 |

**结论**：仅需新增 `mammoth` 一个依赖 (~200KB)。

---

## 十一、分步实施计划

### Phase 1: 核心 EPUB Builder

**目标**：实现最小可用的 EPUB 生成能力

1. 创建 `packages/core/src/convert/types.ts` — 类型定义
2. 创建 `packages/core/src/convert/epub-builder.ts` — EPUB 打包器核心
3. 创建 `packages/core/src/convert/utils/html-normalizer.ts` — HTML → XHTML 规范化
4. 单元测试：输入简单 HTML chapters → 输出可被 foliate-js 解析的 .epub

### Phase 2: 基础格式解析器

**目标**：支持 Markdown、TXT、HTML → EPUB

5. 创建 `packages/core/src/convert/parsers/markdown-parser.ts`
6. 创建 `packages/core/src/convert/parsers/html-parser.ts`
7. 创建 `packages/core/src/convert/convert-service.ts` — 转换服务入口

### Phase 3: 复杂格式解析器

**目标**：支持 DOCX、MOBI/FB2/CBZ → EPUB

8. 安装 mammoth 依赖
9. 创建 `packages/core/src/convert/parsers/docx-parser.ts`
10. 创建 `packages/core/src/convert/parsers/book-parser.ts` — 复用 foliate-js
11. 创建 `packages/core/src/convert/utils/image-extractor.ts` — 图片提取
12. 创建 `packages/core/src/convert/parsers/pdf-parser.ts`

### Phase 4: 桌面端集成

**目标**：在 Tauri 桌面端 UI 中集成转换功能

13. 在 `packages/app/` 中添加转换入口（菜单/按钮）
14. 实现文件选择 → 转换 → 保存流程
15. 添加转换进度提示

### Phase 5: 移动端集成

**目标**：在 Expo RN 端通过 WebView 执行转换

16. 实现 convert-bridge（RN ↔ WebView 通信）
17. 打包转换逻辑到 WebView 可用的 bundle
18. 在移动端 UI 中添加转换入口
19. 实现转换结果保存/分享

### Phase 6: 增强 (可选)

20. TOC 层级嵌套支持（nav.xhtml 嵌套 `<ol>`）
21. 封面页生成（自动从 cover 图片生成封面 XHTML）
22. 桌面端可选调用本地 Pandoc/Calibre 提供高质量转换
23. 转换预览（转换后直接用阅读器预览效果）
24. 批量转换支持

---

## 十二、风险与限制

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| PDF 文本提取质量差 | 扫描 PDF / 复杂排版 PDF 转换后几乎不可读 | 转换前提示用户 PDF 转换效果有限；后续可集成 OCR |
| MOBI DRM 保护 | 受 DRM 保护的 MOBI 无法解析 | 提前检测 DRM，给出明确提示 |
| 大文件内存占用 | 大型 PDF/DOCX 转换时可能 OOM | 分块处理；限制单次转换文件大小 |
| WebView 中的 polyfill | RN WebView 可能缺少某些 API | 转换逻辑在专用 WebView 中运行，预加载所需 polyfill |
| 图片嵌入导致 EPUB 过大 | 图片密集的 DOCX/HTML 转换后 EPUB 很大 | 图片压缩；可选降低图片质量 |
| XHTML 规范化不完整 | 某些 HTML 片段可能无法通过 EPUB 验证 | 使用 DOMParser + XMLSerializer 进行严格的 HTML→XHTML 转换 |

---

## 十三、验证标准

1. **基础验证**：生成的 .epub 文件可被 foliate-js (ReadAny 自身) 正确打开和阅读
2. **结构验证**：EPUB 包含完整的 mimetype、container.xml、content.opf、nav.xhtml
3. **内容验证**：章节内容完整、图片正确显示、TOC 可导航
4. **格式覆盖**：MD、TXT、HTML、DOCX、MOBI、FB2、CBZ、PDF 全部可转换
5. **平台覆盖**：Tauri Desktop、Expo RN、Tauri Mobile 全部可运行
6. **兼容性**：生成的 EPUB 可在 Apple Books、Calibre、Kobo 等主流阅读器中打开
