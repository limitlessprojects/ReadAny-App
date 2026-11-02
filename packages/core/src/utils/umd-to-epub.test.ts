import { describe, it, expect } from "vitest";
import { deflateSync, inflateSync } from "zlib";
import { UmdToEpubConverter } from "./umd-to-epub";

// Reuse the fixture builder structure from umd-parser.test.ts inline so this
// test stays self-contained.

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
  return concat(new Uint8Array([0x23, funcID, 0, 0, 5 + content.length]), content);
}

function dataBlock(dataID: number, content: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0x24]), u32le(dataID), u32le(9 + content.length), content);
}

function buildFixtureWithCover(): Uint8Array {
  const ch1 = "第一章\n第一章的内容。";
  const ch2 = "第二章\n第二章的内容。";
  const contentRaw = concat(enc16(ch1), enc16(ch2));
  const compressed = new Uint8Array(deflateSync(Buffer.from(contentRaw)));
  const offsets = concat(u32le(0), u32le(enc16(ch1).length));
  const titles = concat(
    new Uint8Array([enc16("第一章").length]),
    enc16("第一章"),
    new Uint8Array([enc16("第二章").length]),
    enc16("第二章"),
  );
  const idx = u32le(10);
  const cover = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xde, 0xad, 0xbe, 0xef]);

  return concat(
    new Uint8Array([0x89, 0x9b, 0x9a, 0xde]),
    funcBlock(0x01, new Uint8Array([1])),
    funcBlock(0x02, enc16("测试书")),
    funcBlock(0x03, enc16("张三")),
    funcBlock(0x82, concat(new Uint8Array([1]), u32le(200))),
    funcBlock(0x83, u32le(100)),
    funcBlock(0x84, u32le(101)),
    funcBlock(0x81, u32le(102)),
    funcBlock(0x0b, u32le(contentRaw.length)),
    dataBlock(100, offsets),
    dataBlock(101, titles),
    dataBlock(102, idx),
    dataBlock(10, compressed),
    dataBlock(200, cover),
    funcBlock(0x0c, u32le(0)),
  );
}

const inflate = (b: Uint8Array): Uint8Array => new Uint8Array(inflateSync(Buffer.from(b)));

// Minimal File shim — matches what mobile uses and what the converter needs.
function makeFileShim(bytes: Uint8Array, name: string): File {
  return {
    name,
    size: bytes.byteLength,
    type: "application/octet-stream",
    arrayBuffer: () =>
      Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  } as unknown as File;
}

describe("UmdToEpubConverter", () => {
  it("produces a valid store-only ZIP with EPUB-required structure", async () => {
    const umdBytes = buildFixtureWithCover();
    const converter = new UmdToEpubConverter(inflate);
    const file = makeFileShim(umdBytes, "test.umd");
    const result = await converter.convertToBytes({ file });

    expect(result.bookTitle).toBe("测试书");
    expect(result.author).toBe("张三");
    expect(result.chapterCount).toBe(2);
    expect(result.coverBytes).toBeDefined();
    expect(result.coverMime).toBe("image/jpeg");

    // Verify ZIP signature (PK\x03\x04)
    const epub = result.epubBytes;
    expect(epub[0]).toBe(0x50);
    expect(epub[1]).toBe(0x4b);
    expect(epub[2]).toBe(0x03);
    expect(epub[3]).toBe(0x04);

    // First entry must be `mimetype` per EPUB spec.
    // Local file header layout: 30 bytes header + name + (extra) + data.
    // Filename length at offset 26.
    const filenameLen = new DataView(epub.buffer, epub.byteOffset).getUint16(26, true);
    const firstName = new TextDecoder("utf-8").decode(epub.subarray(30, 30 + filenameLen));
    expect(firstName).toBe("mimetype");

    // Verify mimetype content immediately after the name
    const mime = new TextDecoder("utf-8").decode(
      epub.subarray(30 + filenameLen, 30 + filenameLen + "application/epub+zip".length),
    );
    expect(mime).toBe("application/epub+zip");

    // Scan the archive for expected entries by walking local file headers
    const entries: string[] = [];
    let cursor = 0;
    while (cursor + 30 <= epub.length) {
      const sig = new DataView(epub.buffer, epub.byteOffset + cursor).getUint32(0, true);
      if (sig !== 0x04034b50) break;
      const nLen = new DataView(epub.buffer, epub.byteOffset + cursor).getUint16(26, true);
      const xLen = new DataView(epub.buffer, epub.byteOffset + cursor).getUint16(28, true);
      const cSize = new DataView(epub.buffer, epub.byteOffset + cursor).getUint32(18, true);
      const name = new TextDecoder("utf-8").decode(epub.subarray(cursor + 30, cursor + 30 + nLen));
      entries.push(name);
      cursor += 30 + nLen + xLen + cSize;
    }
    expect(entries).toEqual(
      expect.arrayContaining([
        "mimetype",
        "META-INF/container.xml",
        "style.css",
        "toc.ncx",
        "OEBPS/chapter1.xhtml",
        "OEBPS/chapter2.xhtml",
        "cover.xhtml",
        "cover.jpg",
        "content.opf",
      ]),
    );
  });

  it("throws on UMD with no chapters", async () => {
    // Just magic + EOF — no chapters
    const bytes = concat(
      new Uint8Array([0x89, 0x9b, 0x9a, 0xde]),
      funcBlock(0x01, new Uint8Array([1])),
      funcBlock(0x0c, u32le(0)),
    );
    const converter = new UmdToEpubConverter(inflate);
    await expect(
      converter.convertToBytes({ file: makeFileShim(bytes, "empty.umd") }),
    ).rejects.toThrow(/no chapters/i);
  });
});
