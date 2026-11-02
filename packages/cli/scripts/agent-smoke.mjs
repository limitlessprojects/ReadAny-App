import Database from "better-sqlite3";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptDir, "..");
const binPath = resolve(cliRoot, "dist/bin/readany.js");
const encoder = new TextEncoder();

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function textEntry(name, content) {
  return { name, data: encoder.encode(content) };
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crc32Table = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crc32Table[index] = value;
}

function buildStoreOnlyZip(entries) {
  let totalSize = 22;
  const nameBytes = entries.map((entry) => encoder.encode(entry.name));
  for (let index = 0; index < entries.length; index += 1) {
    totalSize += 30 + nameBytes[index].length + entries[index].data.length;
    totalSize += 46 + nameBytes[index].length;
  }

  const buffer = new Uint8Array(totalSize);
  const view = new DataView(buffer.buffer);
  const localOffsets = [];
  let offset = 0;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const name = nameBytes[index];
    const crc = crc32(entry.data);
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    offset += 4;
    view.setUint16(offset, 20, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint32(offset, crc, true);
    offset += 4;
    view.setUint32(offset, entry.data.length, true);
    offset += 4;
    view.setUint32(offset, entry.data.length, true);
    offset += 4;
    view.setUint16(offset, name.length, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    buffer.set(name, offset);
    offset += name.length;
    buffer.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralDirectoryStart = offset;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const name = nameBytes[index];
    const crc = crc32(entry.data);
    view.setUint32(offset, 0x02014b50, true);
    offset += 4;
    view.setUint16(offset, 20, true);
    offset += 2;
    view.setUint16(offset, 20, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint32(offset, crc, true);
    offset += 4;
    view.setUint32(offset, entry.data.length, true);
    offset += 4;
    view.setUint32(offset, entry.data.length, true);
    offset += 4;
    view.setUint16(offset, name.length, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setUint32(offset, 0, true);
    offset += 4;
    view.setUint32(offset, localOffsets[index], true);
    offset += 4;
    buffer.set(name, offset);
    offset += name.length;
  }

  const centralDirectorySize = offset - centralDirectoryStart;
  view.setUint32(offset, 0x06054b50, true);
  offset += 4;
  view.setUint16(offset, 0, true);
  offset += 2;
  view.setUint16(offset, 0, true);
  offset += 2;
  view.setUint16(offset, entries.length, true);
  offset += 2;
  view.setUint16(offset, entries.length, true);
  offset += 2;
  view.setUint32(offset, centralDirectorySize, true);
  offset += 4;
  view.setUint32(offset, centralDirectoryStart, true);
  offset += 4;
  view.setUint16(offset, 0, true);

  return buffer;
}

function buildInspectableEpub() {
  return buildStoreOnlyZip([
    textEntry("mimetype", "application/epub+zip"),
    textEntry(
      "META-INF/container.xml",
      `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
    ),
    textEntry(
      "OPS/package.opf",
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Agent Smoke Book</dc:title><dc:creator>ReadAny CLI</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="chapter-2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter-1"/><itemref idref="chapter-2"/></spine></package>`,
    ),
    textEntry(
      "OPS/nav.xhtml",
      `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">External Access</a></li><li><a href="chapter-2.xhtml">Draft Safety</a></li></ol></nav></body></html>`,
    ),
    textEntry(
      "OPS/chapter-1.xhtml",
      "<html><body><h1>External Access</h1><p>Agents can read bounded context.</p></body></html>",
    ),
    textEntry(
      "OPS/chapter-2.xhtml",
      "<html><body><h1>Draft Safety</h1><p>Drafts protect original books.</p></body></html>",
    ),
  ]);
}

function buildSimplePdf(pages) {
  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  for (const text of pages) {
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
    const contentId = addObject(
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  }

  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}

function runBuiltCli(args, env) {
  const result = spawnSync(process.execPath, [binPath, ...args], {
    cwd: cliRoot,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`readany ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function assertMcpConfigSnippets(env) {
  for (const client of ["generic", "claude", "cursor"]) {
    const result = runBuiltCli(
      ["mcp", "config", "--profile", "readonly", "--client", client, "--json"],
      env,
    );
    assert(result.ok, `${client} MCP config command did not succeed`);
    assert(result.data.client === client, `${client} MCP config reported the wrong client`);
    assert(result.data.format === "json", `${client} MCP config reported the wrong format`);
    assert(result.data.profile === "readonly", `${client} MCP config reported the wrong profile`);
    assert(
      typeof result.data.snippet === "string",
      `${client} MCP config did not include a snippet`,
    );

    const snippet = JSON.parse(result.data.snippet);
    assert(
      JSON.stringify(snippet) ===
        JSON.stringify({
          mcpServers: {
            readany: {
              command: process.execPath,
              args: [binPath, "mcp", "serve", "--profile", "readonly"],
            },
          },
        }),
      `${client} MCP config snippet was not a pure mcpServers config`,
    );
    assert(
      !result.data.snippet.includes('"client"'),
      `${client} MCP config snippet leaked client metadata`,
    );
    assert(
      !result.data.snippet.includes('"format"'),
      `${client} MCP config snippet leaked format metadata`,
    );
    assert(
      !result.data.snippet.includes('"profile"'),
      `${client} MCP config snippet leaked profile metadata`,
    );
  }

  const codex = runBuiltCli(
    ["mcp", "config", "--profile", "editor", "--client", "codex", "--json"],
    env,
  );
  assert(codex.ok, "codex MCP config command did not succeed");
  assert(codex.data.client === "codex", "codex MCP config reported the wrong client");
  assert(codex.data.format === "toml", "codex MCP config reported the wrong format");
  assert(codex.data.profile === "editor", "codex MCP config reported the wrong profile");
  assert(typeof codex.data.snippet === "string", "codex MCP config did not include a snippet");
  assert(
    codex.data.snippet.includes("[mcp_servers.readany]"),
    "codex MCP config snippet did not include server table",
  );
  assert(
    codex.data.snippet.includes(`command = ${JSON.stringify(process.execPath)}`),
    "codex MCP config snippet did not include command",
  );
  assert(
    codex.data.snippet.includes('"mcp","serve","--profile","editor"'),
    "codex MCP config snippet did not include editor profile args",
  );
  assert(
    !codex.data.snippet.includes("client ="),
    "codex MCP config snippet leaked client metadata",
  );
  assert(
    !codex.data.snippet.includes("format ="),
    "codex MCP config snippet leaked format metadata",
  );
  assert(
    !codex.data.snippet.includes("profile ="),
    "codex MCP config snippet leaked profile metadata",
  );

  const opencode = runBuiltCli(
    ["mcp", "config", "--profile", "readonly", "--client", "opencode", "--json"],
    env,
  );
  assert(opencode.ok, "opencode MCP config command did not succeed");
  assert(opencode.data.client === "opencode", "opencode MCP config reported the wrong client");
  assert(opencode.data.format === "json", "opencode MCP config reported the wrong format");
  assert(opencode.data.profile === "readonly", "opencode MCP config reported the wrong profile");
  assert(
    typeof opencode.data.snippet === "string",
    "opencode MCP config did not include a snippet",
  );

  const opencodeSnippet = JSON.parse(opencode.data.snippet);
  assert(
    JSON.stringify(opencodeSnippet) ===
      JSON.stringify({
        mcp: {
          readany: {
            type: "local",
            command: [process.execPath, binPath, "mcp", "serve", "--profile", "readonly"],
            enabled: true,
          },
        },
      }),
    "opencode MCP config snippet was not a pure mcp.readany config",
  );
  assert(
    !opencode.data.snippet.includes('"mcpServers"'),
    "opencode MCP config used the generic mcpServers shape",
  );
  assert(
    !opencode.data.snippet.includes('"client"'),
    "opencode MCP config snippet leaked client metadata",
  );
  assert(
    !opencode.data.snippet.includes('"format"'),
    "opencode MCP config snippet leaked format metadata",
  );
  assert(
    !opencode.data.snippet.includes('"profile"'),
    "opencode MCP config snippet leaked profile metadata",
  );
}

function parseToolContent(response) {
  const text = response?.result?.content?.[0]?.text;
  assert(
    typeof text === "string",
    `MCP response did not contain tool text: ${JSON.stringify(response)}`,
  );
  return JSON.parse(text);
}

function assertToolSafetyMetadata(tool, expected) {
  assert(tool, `tools/list did not expose ${expected.name}`);
  assert(
    tool._meta?.["readany/risk"] === expected.risk,
    `${expected.name} did not expose expected risk metadata`,
  );
  assert(
    tool._meta?.["readany/minimumProfile"] === expected.minimumProfile,
    `${expected.name} did not expose expected minimumProfile metadata`,
  );
  for (const scope of expected.scopes) {
    assert(
      Array.isArray(tool._meta?.["readany/scopes"]) && tool._meta["readany/scopes"].includes(scope),
      `${expected.name} did not expose expected scope metadata: ${scope}`,
    );
  }
  assert(
    typeof tool.description === "string" &&
      tool.description.includes(`Minimum profile: ${expected.minimumProfile}`),
    `${expected.name} description did not include minimum profile summary`,
  );
}

function callMcp(profile, requests, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [binPath, "mcp", "serve", "--profile", profile], {
      cwd: cliRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `MCP ${profile} exited with ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
        return;
      }
      try {
        const lines = Buffer.concat(stdout).toString("utf8").trim().split("\n").filter(Boolean);
        resolvePromise(lines.map((line) => JSON.parse(line)));
      } catch (error) {
        reject(error);
      }
    });

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
    child.stdin.end();
  });
}

export async function seedLibrary(dataRoot) {
  await mkdir(join(dataRoot, "books"), { recursive: true });
  const epubPath = join(dataRoot, "books", "agent-smoke.epub");
  await writeFile(epubPath, buildInspectableEpub());
  await writeFile(
    join(dataRoot, "books", "agent-smoke.pdf"),
    buildSimplePdf([
      "PDF smoke agents need page fallback",
      "Second PDF smoke page keeps references stable",
    ]),
  );

  const db = new Database(join(dataRoot, "readany.db"));
  db.exec(`
    INSERT INTO books (
      id, file_path, format, title, author, publisher, language, isbn, description,
      cover_url, publish_date, rating, reviews, subjects, total_pages, total_chapters,
      group_id, added_at, last_opened_at, updated_at, deleted_at, progress, current_cfi,
      is_vectorized, vectorize_progress, tags, file_hash, sync_status
    ) VALUES (
      'agent-smoke-book', 'books/agent-smoke.epub', 'epub', 'Agent Smoke Book', 'ReadAny CLI',
      NULL, 'en', NULL, 'External agent smoke fixture', NULL, NULL, NULL, NULL, '["AI"]',
      100, 2, NULL, 1000, 2000, 3000, NULL, 0.5, 'epubcfi(/6/2)', 1, 1,
      '["agent","smoke"]', 'hash-agent-smoke', 'local'
    ),
    (
      'agent-smoke-pdf', 'books/agent-smoke.pdf', 'pdf', 'Agent Smoke PDF', 'ReadAny CLI',
      NULL, 'en', NULL, 'External agent PDF fallback fixture', NULL, NULL, NULL, NULL, '["AI","PDF"]',
      2, 2, NULL, 1100, 2100, 3100, NULL, 0.25, 'page:1', 0, 0,
      '["agent","smoke","pdf"]', 'hash-agent-smoke-pdf', 'local'
    );

    INSERT INTO notes (
      id, book_id, highlight_id, cfi, title, content, chapter_title, tags, created_at, updated_at
    ) VALUES (
      'agent-smoke-note', 'agent-smoke-book', NULL, 'epubcfi(/6/4)', 'Access boundary',
      'External agents should use readonly first.', 'External Access', '["agent"]', 4000, 4000
    );

    INSERT INTO highlights (
      id, book_id, cfi, text, color, note, chapter_title, created_at, updated_at
    ) VALUES (
      'agent-smoke-highlight', 'agent-smoke-book', 'epubcfi(/6/8)',
      'Draft-first editing protects original books.', 'yellow', 'Safety invariant',
      'Draft Safety', 5000, 5000
    );
  `);
  db.close();

  const localDb = new Database(join(dataRoot, "readany_local.db"));
  localDb.exec(`
    INSERT INTO chunks (
      id, book_id, chapter_index, chapter_title, content, token_count,
      start_cfi, end_cfi, segment_cfis, embedding, updated_at
    ) VALUES
    (
      'agent-smoke-chunk-1', 'agent-smoke-book', 1, 'External Access',
      'External agents can search ReadAny through bounded MCP tools.',
      9, 'epubcfi(/6/10)', 'epubcfi(/6/12)', '["epubcfi(/6/10)"]', NULL, 6000
    ),
    (
      'agent-smoke-chunk-2', 'agent-smoke-book', 2, 'Draft Safety',
      'Draft-first EPUB editing keeps source files unchanged.',
      8, 'epubcfi(/6/14)', 'epubcfi(/6/16)', '["epubcfi(/6/14)"]', NULL, 6000
    );
  `);
  localDb.close();

  return epubPath;
}

async function seedExportedBook(dataRoot, exportPath, exportedHash) {
  await mkdir(join(dataRoot, "books"), { recursive: true });
  const libraryPath = join(dataRoot, "books", "agent-smoke-exported.epub");
  await copyFile(exportPath, libraryPath);

  const db = new Database(join(dataRoot, "readany.db"));
  db.prepare(`
    INSERT INTO books (
      id, file_path, format, title, author, publisher, language, isbn, description,
      cover_url, publish_date, rating, reviews, subjects, total_pages, total_chapters,
      group_id, added_at, last_opened_at, updated_at, deleted_at, progress, current_cfi,
      is_vectorized, vectorize_progress, tags, file_hash, sync_status
    ) VALUES (
      'agent-smoke-exported-book', 'books/agent-smoke-exported.epub', 'epub',
      'Agent Smoke Exported Book', 'ReadAny CLI', NULL, 'en', NULL,
      'Reimported external agent smoke export', NULL, NULL, NULL, NULL, '["AI","export"]',
      100, 2, NULL, 7000, 7000, 7000, NULL, 0, NULL, 0, 0,
      '["agent","smoke","exported"]', ?, 'local'
    )
  `).run(exportedHash);
  db.close();

  return libraryPath;
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "readany-agent-smoke-"));
  const dataRoot = join(root, "library");
  const env = {
    ...process.env,
    READANY_HOME: dataRoot,
    AGENT_HOME: join(root, "agent"),
  };

  const doctor = runBuiltCli(["doctor", "--json"], env);
  assert(doctor.ok, "doctor did not initialize the CLI workspace");
  const emptyBooks = runBuiltCli(["books", "list", "--json"], env);
  assert(emptyBooks.ok, "books list did not initialize the CLI data schema");
  assertMcpConfigSnippets(env);
  const epubPath = await seedLibrary(dataRoot);
  const sourceBefore = await readFile(epubPath);
  const sourceHashBefore = hashBuffer(sourceBefore);

  const readonlyResponses = await callMcp(
    "readonly",
    [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "books.search", arguments: { query: "smoke", limit: 5 } },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "rag.search",
          arguments: { query: "bounded MCP", bookId: "agent-smoke-book", limit: 3 },
        },
      },
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "agent-smoke-book" } },
      },
    ],
    env,
  );

  assert(readonlyResponses[0]?.result?.serverInfo?.name === "readany", "initialize failed");
  const tools = readonlyResponses[1]?.result?.tools ?? [];
  assert(
    tools.some((tool) => tool.name === "epub.chapters.patch"),
    "tools/list did not expose epub.chapters.patch",
  );
  assertToolSafetyMetadata(
    tools.find((tool) => tool.name === "books.search"),
    { name: "books.search", risk: "low", minimumProfile: "readonly", scopes: ["book.read"] },
  );
  assertToolSafetyMetadata(
    tools.find((tool) => tool.name === "epub.chapters.patch"),
    { name: "epub.chapters.patch", risk: "high", minimumProfile: "editor", scopes: ["epub.draft"] },
  );
  assertToolSafetyMetadata(
    tools.find((tool) => tool.name === "epub.export"),
    { name: "epub.export", risk: "high", minimumProfile: "publisher", scopes: ["epub.export"] },
  );
  const books = parseToolContent(readonlyResponses[2]);
  assert(
    books.ok && books.data.books.some((book) => book.id === "agent-smoke-book"),
    "books.search failed",
  );
  const rag = parseToolContent(readonlyResponses[3]);
  assert(rag.ok && rag.data.results.length > 0, "rag.search failed");
  const deniedDraft = parseToolContent(readonlyResponses[4]);
  assert(
    !deniedDraft.ok && deniedDraft.error.code === "permission_denied",
    "readonly write was not denied",
  );

  const pdfResponses = await callMcp(
    "readonly",
    [
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "chapters.list", arguments: { bookId: "agent-smoke-pdf" } },
      },
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "chapters.get",
          arguments: { bookId: "agent-smoke-pdf", chapterId: "page-1" },
        },
      },
    ],
    env,
  );
  const pdfChapters = parseToolContent(pdfResponses[0]);
  assert(
    pdfChapters.ok &&
      pdfChapters.data.chapters.some(
        (chapter) => chapter.source === "pdf" && chapter.id === "page-1" && chapter.page === 1,
      ),
    `PDF fallback chapters.list failed: ${JSON.stringify(pdfChapters)}`,
  );
  const pdfPage = parseToolContent(pdfResponses[1]);
  assert(
    pdfPage.ok &&
      pdfPage.data.chapter.source === "pdf" &&
      pdfPage.data.chapter.cfi === "page:1" &&
      pdfPage.data.chapter.content.includes("PDF smoke agents need page fallback"),
    `PDF fallback chapters.get failed: ${JSON.stringify(pdfPage)}`,
  );

  const editorResponses = await callMcp(
    "editor",
    [
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "epub.draft.create", arguments: { bookId: "agent-smoke-book" } },
      },
    ],
    env,
  );
  const draftCreate = parseToolContent(editorResponses[0]);
  assert(draftCreate.ok, "editor draft create failed");
  const draftId = draftCreate.data.draft.draftId;

  const editorPatchResponses = await callMcp(
    "editor",
    [
      {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "epub.chapters.patch",
          arguments: {
            draftId,
            patches: [
              {
                chapterId: "chapter-1",
                xhtml:
                  '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Agent Revised Access</h1><p>External agent smoke updated the first chapter.</p></body></html>',
              },
              {
                chapterId: "chapter-2",
                xhtml:
                  '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Agent Revised Safety</h1><p>External agent smoke updated the second chapter.</p></body></html>',
              },
            ],
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "epub.toc.rebuild", arguments: { draftId } },
      },
      {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: { name: "epub.validate", arguments: { draftId } },
      },
    ],
    env,
  );
  const batch = parseToolContent(editorPatchResponses[0]);
  assert(batch.ok && batch.data.batch.changedCount === 2, "batch chapter patch failed");
  const toc = parseToolContent(editorPatchResponses[1]);
  assert(toc.ok, "toc rebuild failed");
  const deniedValidate = parseToolContent(editorPatchResponses[2]);
  assert(
    !deniedValidate.ok && deniedValidate.error.code === "permission_denied",
    "editor validate was not denied",
  );

  const exportPath = join(root, "exports", "agent-smoke-export.epub");
  const publisherResponses = await callMcp(
    "publisher",
    [
      {
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: { name: "epub.validate", arguments: { draftId } },
      },
      {
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: { name: "epub.export", arguments: { draftId, outputPath: exportPath } },
      },
    ],
    env,
  );
  const validation = parseToolContent(publisherResponses[0]);
  assert(validation.ok && validation.data.validation.valid, "publisher validate failed");
  const exported = parseToolContent(publisherResponses[1]);
  assert(
    exported.ok && exported.data.export.outputPath.endsWith("agent-smoke-export.epub"),
    "publisher export failed",
  );

  const sourceAfter = await readFile(epubPath);
  assert(sourceHashBefore === hashBuffer(sourceAfter), "source EPUB changed during smoke");
  const exportBytes = await readFile(exportPath);
  assert(exportBytes.length > 0, "exported EPUB is empty");
  const exportedHash = hashBuffer(exportBytes);
  await seedExportedBook(dataRoot, exportPath, exportedHash);

  const reimportResponses = await callMcp(
    "editor",
    [
      {
        jsonrpc: "2.0",
        id: 30,
        method: "tools/call",
        params: { name: "epub.inspect", arguments: { bookId: "agent-smoke-exported-book" } },
      },
      {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: { name: "chapters.list", arguments: { bookId: "agent-smoke-exported-book" } },
      },
      {
        jsonrpc: "2.0",
        id: 32,
        method: "tools/call",
        params: {
          name: "chapters.get",
          arguments: {
            bookId: "agent-smoke-exported-book",
            chapterId: "chapter-1",
            contentLimit: 2000,
          },
        },
      },
      {
        jsonrpc: "2.0",
        id: 33,
        method: "tools/call",
        params: {
          name: "chapters.get",
          arguments: {
            bookId: "agent-smoke-exported-book",
            chapterId: "chapter-2",
            contentLimit: 2000,
          },
        },
      },
    ],
    env,
  );
  const reimportInspect = parseToolContent(reimportResponses[0]);
  assert(
    reimportInspect.ok && reimportInspect.data.epub.spine.items.length === 2,
    "exported EPUB inspect did not find the expected spine",
  );
  const reimportChapters = parseToolContent(reimportResponses[1]);
  assert(
    reimportChapters.ok &&
      reimportChapters.data.chapters.some((chapter) => chapter.id === "chapter-1") &&
      reimportChapters.data.chapters.some((chapter) => chapter.id === "chapter-2"),
    "exported EPUB chapters.list did not find patched chapters",
  );
  const reimportChapterOne = parseToolContent(reimportResponses[2]);
  assert(
    reimportChapterOne.ok &&
      reimportChapterOne.data.chapter.content.includes("Agent Revised Access") &&
      reimportChapterOne.data.chapter.content.includes("updated the first chapter"),
    "exported EPUB chapter-1 did not contain patched content",
  );
  const reimportChapterTwo = parseToolContent(reimportResponses[3]);
  assert(
    reimportChapterTwo.ok &&
      reimportChapterTwo.data.chapter.content.includes("Agent Revised Safety") &&
      reimportChapterTwo.data.chapter.content.includes("updated the second chapter"),
    "exported EPUB chapter-2 did not contain patched content",
  );

  const summary = {
    ok: true,
    workspace: root,
    bookId: "agent-smoke-book",
    draftId,
    exportPath,
    sourceHash: sourceHashBefore,
    exportHash: exportedHash,
    checks: [
      "readonly MCP initialize/tools/list/books.search/rag.search",
      "copyable MCP config snippets",
      "tools/list safety metadata",
      "readonly PDF fallback chapters.list/chapters.get",
      "readonly write denial",
      "editor draft create, batch chapter patch, and toc rebuild",
      "publisher validate and export",
      "source EPUB hash unchanged",
      "exported EPUB reimport inspect and chapter reads",
    ],
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
