import { describe, it, expect, vi } from "vitest";
import { gzipSync, deflateSync } from "zlib";
import { parseUmd } from "./umd-parser";

// Hand-build a minimal UMD file to verify the parser's binary protocol port.
// Layout we construct here:
//   - magic 0x89 0x9B 0x9A 0xDE
//   - func 0x01 (text=1)
//   - func 0x02 (title, UTF-16LE)
//   - func 0x03 (author)
//   - func 0x04/0x05/0x06 (year/month/day)
//   - func 0x82 (cover: jpg, dataID = 200)
//   - func 0x83 (chapter offsets dataID = 100)
//   - func 0x84 (chapter titles dataID = 101)
//   - func 0x81 (content blocks index dataID = 102)
//   - func 0x0B (content length)
//   - data 100: chapter offsets [0, X]
//   - data 101: title list (1-byte len + UTF-16LE) × 2
//   - data 102: content blocks index [10]
//   - data 10:  zlib-compressed UTF-16LE content (chapter1 + chapter2)
//   - data 200: cover bytes
//   - func 0x0C (EOF)

const enc16 = (s: string): Uint8Array => {
  const buf = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    buf[i * 2] = cp & 0xff;
    buf[i * 2 + 1] = (cp >> 8) & 0xff;
  }
  return buf;
};

const u32le = (n: number): Uint8Array => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, true);
  return out;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

function funcBlock(funcID: number, content: Uint8Array): Uint8Array {
  // Layout: '#' funcID 0x00 0x00 funcLen content
  // funcLen = total block length = 5 + content.length (must fit u8)
  const funcLen = 5 + content.length;
  if (funcLen > 255) throw new Error("funcBlock too large");
  return concat(new Uint8Array([0x23, funcID, 0, 0, funcLen]), content);
}

function dataBlock(dataID: number, content: Uint8Array): Uint8Array {
  // Layout: '$' dataID[4 LE] dataLen[4 LE] content
  // dataLen covers full 9-byte header + content
  const dataLen = 9 + content.length;
  return concat(new Uint8Array([0x24]), u32le(dataID), u32le(dataLen), content);
}

function buildFixture(): { bytes: Uint8Array; expectedContent: string; coverBytes: Uint8Array } {
  // Two chapters' content concatenated
  const ch1 = "第一章 起源\n这是第一章的正文内容。";
  const ch2 = "第二章 发展\n这是第二章。";
  const ch1Bytes = enc16(ch1);
  const ch2Bytes = enc16(ch2);
  // Concatenate then deflate(zlib) — Go's compress/zlib produces zlib-framed
  // deflate, which is what Node's deflateSync also produces.
  const contentRaw = concat(ch1Bytes, ch2Bytes);
  const compressedContent = new Uint8Array(deflateSync(Buffer.from(contentRaw)));

  // Chapter offsets in bytes
  const off1 = 0;
  const off2 = ch1Bytes.length;
  const chapterOffsets = concat(u32le(off1), u32le(off2));

  // Title list: 1-byte byte-length + UTF-16LE bytes
  const t1 = enc16("第一章 起源");
  const t2 = enc16("第二章 发展");
  const titleList = concat(
    new Uint8Array([t1.length]),
    t1,
    new Uint8Array([t2.length]),
    t2,
  );

  // Content block index — one dataID = 10 (our compressed content block)
  const contentBlocksIndex = u32le(10);

  // Fake cover (4 bytes — parser shouldn't care about actual JPEG validity)
  const coverBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

  // Magic
  const magic = new Uint8Array([0x89, 0x9b, 0x9a, 0xde]);

  // Functional headers
  const fHeader = funcBlock(0x01, new Uint8Array([1])); // text
  const fTitle = funcBlock(0x02, enc16("测试书名"));
  const fAuthor = funcBlock(0x03, enc16("测试作者"));
  const fYear = funcBlock(0x04, enc16("2026"));
  const fMonth = funcBlock(0x05, enc16("05"));
  const fDay = funcBlock(0x06, enc16("22"));
  const fCoverPtr = funcBlock(0x82, concat(new Uint8Array([1]), u32le(200)));
  const fChapPtr = funcBlock(0x83, u32le(100));
  const fTitlePtr = funcBlock(0x84, u32le(101));
  const fContPtr = funcBlock(0x81, u32le(102));
  const fContLen = funcBlock(0x0b, u32le(contentRaw.length));
  // EOF must come after all data blocks
  const dOffsets = dataBlock(100, chapterOffsets);
  const dTitles = dataBlock(101, titleList);
  const dContentIdx = dataBlock(102, contentBlocksIndex);
  const dContent = dataBlock(10, compressedContent);
  const dCover = dataBlock(200, coverBytes);
  const fEof = funcBlock(0x0c, u32le(0));

  const bytes = concat(
    magic,
    fHeader,
    fTitle,
    fAuthor,
    fYear,
    fMonth,
    fDay,
    fCoverPtr,
    fChapPtr,
    fTitlePtr,
    fContPtr,
    fContLen,
    dOffsets,
    dTitles,
    dContentIdx,
    dContent,
    dCover,
    fEof,
  );

  return { bytes, expectedContent: ch1 + ch2, coverBytes };
}

// Use Node's zlib inflate as the injected impl
import { inflateSync } from "zlib";
const inflate = (compressed: Uint8Array): Uint8Array =>
  new Uint8Array(inflateSync(Buffer.from(compressed)));

describe("parseUmd", () => {
  it("extracts metadata, chapters, and cover from a minimal fixture", () => {
    const { bytes, coverBytes } = buildFixture();
    const parsed = parseUmd(bytes, inflate);
    expect(parsed.bookTitle).toBe("测试书名");
    expect(parsed.author).toBe("测试作者");
    expect(parsed.date).toBe("2026-05-22");
    expect(parsed.chapters).toHaveLength(2);
    expect(parsed.chapters[0]!.title).toBe("第一章 起源");
    expect(parsed.chapters[0]!.content).toBe("第一章 起源\n这是第一章的正文内容。");
    expect(parsed.chapters[1]!.title).toBe("第二章 发展");
    expect(parsed.chapters[1]!.content).toBe("第二章 发展\n这是第二章。");
    expect(parsed.coverBytes).toBeDefined();
    expect(Array.from(parsed.coverBytes!)).toEqual(Array.from(coverBytes));
    expect(parsed.coverMime).toBe("image/jpeg");
  });

  it("rejects files without UMD magic", () => {
    const bad = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(() => parseUmd(bad, inflate)).toThrow(/magic/i);
  });

  it("rejects comic UMD variant", () => {
    const magic = new Uint8Array([0x89, 0x9b, 0x9a, 0xde]);
    const header = funcBlock(0x01, new Uint8Array([2])); // 2 = comic
    expect(() => parseUmd(concat(magic, header), inflate)).toThrow(/non-text/i);
  });

  it("converts U+2029 paragraph separators to newlines on even byte boundary", () => {
    // Build a fixture with U+2029 (0x29 0x20 in UTF-16LE) in the content
    const text = "上一段 下一段";
    const textBytes = enc16(text);
    const compressed = new Uint8Array(deflateSync(Buffer.from(textBytes)));

    const offsets = u32le(0);
    const titles = concat(new Uint8Array([enc16("章节").length]), enc16("章节"));
    const idx = u32le(10);

    const magic = new Uint8Array([0x89, 0x9b, 0x9a, 0xde]);
    const bytes = concat(
      magic,
      funcBlock(0x01, new Uint8Array([1])),
      funcBlock(0x83, u32le(100)),
      funcBlock(0x84, u32le(101)),
      funcBlock(0x81, u32le(102)),
      funcBlock(0x0b, u32le(textBytes.length)),
      dataBlock(100, offsets),
      dataBlock(101, titles),
      dataBlock(102, idx),
      dataBlock(10, compressed),
      funcBlock(0x0c, u32le(0)),
    );
    const parsed = parseUmd(bytes, inflate);
    expect(parsed.chapters[0]!.content).toBe("上一段\n下一段");
  });

  it("decodes UTF-16LE via manual fallback when TextDecoder('utf-16le') is unavailable", async () => {
    const original = globalThis.TextDecoder;
    class HobbledDecoder {
      constructor(label?: string) {
        if (label && label !== "utf-8") {
          throw new RangeError(`Unknown encoding: ${label}`);
        }
      }
      decode(): string {
        return "";
      }
    }
    // @ts-expect-error overriding global for test
    globalThis.TextDecoder = HobbledDecoder;
    try {
      vi.resetModules();
      const fresh = await import("./umd-parser");
      const { bytes, expectedContent } = buildFixture();
      const parsed = fresh.parseUmd(bytes, inflate);
      expect(parsed.bookTitle).toBe("测试书名");
      expect(parsed.author).toBe("测试作者");
      expect(parsed.chapters[0]!.content + parsed.chapters[1]!.content).toBe(expectedContent);
    } finally {
      globalThis.TextDecoder = original;
      vi.resetModules();
    }
  });

  // Suppress unused gzipSync — kept available in case a future fixture needs it
  void gzipSync;
});
