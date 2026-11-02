/**
 * UMD ebook parser.
 *
 * UMD (Universal Mobile Document) was a proprietary Chinese mobile ebook
 * format used widely on feature phones c. 2008–2014. Text-only variant
 * only; comic UMD (file-type 2) is rejected.
 *
 * Binary layout (little-endian throughout):
 *
 *   magic        4 bytes  0x89 0x9B 0x9A 0xDE
 *   blocks       repeat until EOF
 *
 *   functional block "#":
 *     0x23 funcID xx xx funcLen content[funcLen-5]
 *     where funcLen is a 1-byte total block size (≤255)
 *
 *   data block "$":
 *     0x24 dataID[4 LE] dataLen[4 LE] content[dataLen-9]
 *     dataLen covers the 9-byte header
 *
 * Notable function IDs:
 *   0x01 file header (content[0]: 1=text, 2=comic — we only accept text)
 *   0x02 title (UTF-16LE)
 *   0x03 author
 *   0x04/0x05/0x06 year/month/day
 *   0x07 type, 0x08 publisher, 0x09 retailer
 *   0x0A content-stream id (informational)
 *   0x0B uncompressed content total length (uint32 LE)
 *   0x0C EOF marker — triggers final assembly
 *   0x81 dataID of content-block index
 *   0x82 cover: content[0]==1 → jpg, content[1..4] = dataID of cover blob
 *   0x83 dataID of chapter-offset list
 *   0x84 dataID of chapter-title list
 *   0x87 page offset hints (ignored)
 *   0xF0 CDS key, 0xF1 license (ignored)
 *
 * Final assembly (at 0x0C):
 *   1. Decompress content data blocks (zlib) and concatenate in file
 *      order, restricted to the IDs listed in the content-block index.
 *   2. Replace UTF-16LE bytes 0x29 0x20 (U+2029 paragraph separator)
 *      with 0x0A 0x00 (U+000A LF) — UMD's chosen paragraph delimiter.
 *   3. Trim concatenated bytes to the declared content length.
 *   4. Chapter titles: sequence of (1-byte byte-length, UTF-16LE bytes).
 *   5. Chapter offsets: array of uint32 LE byte-offsets into the
 *      concatenated content. Final chapter goes to contentLen.
 *
 * Reference: linpinger/golib/ebook/UMDReader.go (Go), this is a faithful
 * TypeScript port — same byte layout, same quirks.
 */

const UMD_MAGIC = [0x89, 0x9b, 0x9a, 0xde] as const;

export type UmdInflate = (compressed: Uint8Array) => Uint8Array;

export interface UmdChapter {
  title: string;
  content: string;
}

export interface UmdParsed {
  bookTitle: string;
  author: string;
  date: string; // "YYYY-MM-DD" or "--" components if missing
  bookType: string;
  publisher: string;
  retailer: string;
  chapters: UmdChapter[];
  coverBytes?: Uint8Array;
  coverMime?: "image/jpeg";
}

// Hermes (React Native) only supports utf-8 in TextDecoder, so we feature-detect
// utf-16le and fall back to a manual decoder. Done at module load — the throw
// would surface as "runtime not ready" before anything else got a chance to run.
const utf16leDecoder: TextDecoder | null = (() => {
  try {
    return new TextDecoder("utf-16le");
  } catch {
    return null;
  }
})();

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function decodeUtf16LE(bytes: Uint8Array): string {
  if (utf16leDecoder) {
    return utf16leDecoder.decode(bytes);
  }
  // Manual UTF-16LE decode. JS strings are already UTF-16 internally, so each
  // 16-bit code unit maps 1:1 to a string char (surrogate pairs pass through
  // unchanged, same as TextDecoder would yield).
  const len = bytes.length & ~1; // round down to even
  const CHUNK = 8192; // bounded apply() arg count to avoid stack issues
  const buf: number[] = new Array(CHUNK);
  let out = "";
  for (let start = 0; start < len; start += CHUNK * 2) {
    const stop = Math.min(len, start + CHUNK * 2);
    const n = (stop - start) >>> 1;
    for (let i = 0; i < n; i++) {
      const off = start + (i << 1);
      buf[i] = bytes[off]! | (bytes[off + 1]! << 8);
    }
    out += String.fromCharCode.apply(null, n === CHUNK ? buf : buf.slice(0, n));
  }
  return out;
}

function checkMagic(bytes: Uint8Array): void {
  if (bytes.length < 4) {
    throw new Error("UMD: file too short");
  }
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== UMD_MAGIC[i]) {
      throw new Error("UMD: invalid magic bytes");
    }
  }
}

/**
 * Parse a UMD file from a byte buffer.
 *
 * `inflate` must implement zlib (Inflate) — not raw deflate. On desktop
 * use `fflate.unzlibSync`; on mobile use `pako.inflate`.
 */
export function parseUmd(bytes: Uint8Array, inflate: UmdInflate): UmdParsed {
  checkMagic(bytes);

  const fileLen = bytes.length;
  let offset = 4;

  let bookTitle = "";
  let author = "";
  let year = "";
  let month = "";
  let day = "";
  let bookType = "";
  let publisher = "";
  let retailer = "";

  let contentLen = 0;
  let idContentBlocks = 0;
  let idTitleList = 0;
  let idChapterList = 0;
  let idCover = 0;
  let hasCover = false;

  // data-block id list, in file order — content reassembly walks this
  const dataOrder: number[] = [];
  // data-block id → raw payload
  const dataById = new Map<number, Uint8Array>();

  while (offset + 5 <= fileLen) {
    const blockType = bytes[offset]!;

    if (blockType === 0x23) {
      // Functional block: '#' funcID ?? ?? funcLen content...
      const funcID = bytes[offset + 1]!;
      const funcLen = bytes[offset + 4]!;
      if (funcLen < 5 || offset + funcLen > fileLen) break;

      const content = bytes.subarray(offset + 5, offset + funcLen);

      switch (funcID) {
        case 0x01: {
          // 1 = text, 2 = comic
          if (content.length === 0 || content[0] !== 1) {
            throw new Error("UMD: non-text variant not supported");
          }
          break;
        }
        case 0x02:
          bookTitle = decodeUtf16LE(content);
          break;
        case 0x03:
          author = decodeUtf16LE(content);
          break;
        case 0x04:
          year = decodeUtf16LE(content);
          break;
        case 0x05:
          month = decodeUtf16LE(content);
          break;
        case 0x06:
          day = decodeUtf16LE(content);
          break;
        case 0x07:
          bookType = decodeUtf16LE(content);
          break;
        case 0x08:
          publisher = decodeUtf16LE(content);
          break;
        case 0x09:
          retailer = decodeUtf16LE(content);
          break;
        case 0x0b: // uncompressed content total length
          if (content.length >= 4) contentLen = readUint32LE(content, 0);
          break;
        case 0x0c: // EOF marker — assemble below, then return
          offset += funcLen;
          return assemble({
            bytes,
            bookTitle,
            author,
            date: `${year}-${month}-${day}`,
            bookType,
            publisher,
            retailer,
            contentLen,
            idContentBlocks,
            idTitleList,
            idChapterList,
            idCover: hasCover ? idCover : 0,
            dataOrder,
            dataById,
            inflate,
          });
        case 0x81:
          if (content.length >= 4) idContentBlocks = readUint32LE(content, 0);
          break;
        case 0x82: {
          // content[0]: 1=jpg; content[1..4] = dataID
          if (content.length >= 5 && content[0] === 1) {
            hasCover = true;
            idCover = readUint32LE(content, 1);
          }
          break;
        }
        case 0x83:
          if (content.length >= 4) idChapterList = readUint32LE(content, 0);
          break;
        case 0x84:
          if (content.length >= 4) idTitleList = readUint32LE(content, 0);
          break;
        // 0x0A, 0x87, 0xF0, 0xF1, default: ignored
      }

      offset += funcLen;
      continue;
    }

    if (blockType === 0x24) {
      // Data block: '$' dataID[4] dataLen[4] content[dataLen-9]
      if (offset + 9 > fileLen) break;
      const dataID = readUint32LE(bytes, offset + 1);
      const dataLen = readUint32LE(bytes, offset + 5);
      if (dataLen < 9 || offset + dataLen > fileLen) break;

      dataOrder.push(dataID);
      dataById.set(dataID, bytes.subarray(offset + 9, offset + dataLen));

      offset += dataLen;
      continue;
    }

    throw new Error(`UMD: unknown block type 0x${blockType.toString(16)} at offset ${offset}`);
  }

  // Reached EOF without a 0x0C marker — assemble with what we have.
  return assemble({
    bytes,
    bookTitle,
    author,
    date: `${year}-${month}-${day}`,
    bookType,
    publisher,
    retailer,
    contentLen,
    idContentBlocks,
    idTitleList,
    idChapterList,
    idCover: hasCover ? idCover : 0,
    dataOrder,
    dataById,
    inflate,
  });
}

interface AssembleArgs {
  bytes: Uint8Array;
  bookTitle: string;
  author: string;
  date: string;
  bookType: string;
  publisher: string;
  retailer: string;
  contentLen: number;
  idContentBlocks: number;
  idTitleList: number;
  idChapterList: number;
  idCover: number;
  dataOrder: number[];
  dataById: Map<number, Uint8Array>;
  inflate: UmdInflate;
}

function assemble(a: AssembleArgs): UmdParsed {
  const titles = parseTitles(a.dataById.get(a.idTitleList));
  const offsets = parseChapterOffsets(a.dataById.get(a.idChapterList));
  const contentBytes = decompressContent(a);

  const chapters: UmdChapter[] = [];
  const effectiveContentLen = a.contentLen > 0 && a.contentLen <= contentBytes.length
    ? a.contentLen
    : contentBytes.length;

  for (let i = 0; i < titles.length; i++) {
    const start = offsets[i] ?? 0;
    const end = i + 1 < offsets.length ? offsets[i + 1]! : effectiveContentLen;
    const clampedStart = Math.min(Math.max(start, 0), effectiveContentLen);
    const clampedEnd = Math.min(Math.max(end, clampedStart), effectiveContentLen);
    const slice = contentBytes.subarray(clampedStart, clampedEnd);
    chapters.push({ title: titles[i]!, content: decodeUtf16LE(slice) });
  }

  // Fallback: no chapters detected but we do have content — emit one chapter.
  if (chapters.length === 0 && effectiveContentLen > 0) {
    chapters.push({
      title: a.bookTitle || "正文",
      content: decodeUtf16LE(contentBytes.subarray(0, effectiveContentLen)),
    });
  }

  let coverBytes: Uint8Array | undefined;
  let coverMime: "image/jpeg" | undefined;
  if (a.idCover) {
    const blob = a.dataById.get(a.idCover);
    if (blob && blob.length > 0) {
      coverBytes = blob;
      coverMime = "image/jpeg";
    }
  }

  return {
    bookTitle: a.bookTitle,
    author: a.author,
    date: a.date,
    bookType: a.bookType,
    publisher: a.publisher,
    retailer: a.retailer,
    chapters,
    coverBytes,
    coverMime,
  };
}

function parseTitles(data: Uint8Array | undefined): string[] {
  if (!data) return [];
  const titles: string[] = [];
  let i = 0;
  while (i < data.length) {
    const len = data[i]!;
    i += 1;
    if (i + len > data.length) break;
    titles.push(decodeUtf16LE(data.subarray(i, i + len)));
    i += len;
  }
  return titles;
}

function parseChapterOffsets(data: Uint8Array | undefined): number[] {
  if (!data) return [];
  const out: number[] = [];
  const count = Math.floor(data.length / 4);
  for (let i = 0; i < count; i++) {
    out.push(readUint32LE(data, i * 4));
  }
  return out;
}

function decompressContent(a: AssembleArgs): Uint8Array {
  const indexData = a.dataById.get(a.idContentBlocks);
  if (!indexData || indexData.length < 4) return new Uint8Array(0);

  // Content-block index is a list of uint32 LE dataIDs.
  const validIds = new Set<number>();
  const idxCount = Math.floor(indexData.length / 4);
  for (let i = 0; i < idxCount; i++) {
    validIds.add(readUint32LE(indexData, i * 4));
  }

  // Walk all data blocks in file order; if listed in the index, decompress
  // and append. This preserves canonical reading order (per UMDReader.go).
  const pieces: Uint8Array[] = [];
  let total = 0;
  for (const id of a.dataOrder) {
    if (!validIds.has(id)) continue;
    const compressed = a.dataById.get(id);
    if (!compressed) continue;
    let decoded: Uint8Array;
    try {
      decoded = a.inflate(compressed);
    } catch (e) {
      throw new Error(`UMD: zlib inflate failed for data block ${id}: ${e instanceof Error ? e.message : e}`);
    }
    pieces.push(decoded);
    total += decoded.length;
  }

  // Concatenate
  const joined = new Uint8Array(total);
  let off = 0;
  for (const p of pieces) {
    joined.set(p, off);
    off += p.length;
  }

  // Replace UTF-16LE paragraph separator (U+2029 → bytes 0x29 0x20) with
  // line feed (U+000A → bytes 0x0A 0x00). UMD uses 0x2029 as its
  // paragraph delimiter; downstream code expects LF.
  for (let i = 0; i + 1 < joined.length; i++) {
    if (joined[i] === 0x29 && joined[i + 1] === 0x20) {
      // Only treat as paragraph separator on an even byte boundary —
      // otherwise we'd corrupt a legit Chinese char whose low byte is 0x29.
      if (i % 2 === 0) {
        joined[i] = 0x0a;
        joined[i + 1] = 0x00;
        i++; // skip the next byte we just wrote
      }
    }
  }

  return joined;
}
