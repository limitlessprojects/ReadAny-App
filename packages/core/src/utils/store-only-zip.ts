/**
 * Minimal store-only (uncompressed) ZIP builder. No external deps, no Blob.
 *
 * Used to produce EPUB files in environments where @zip.js/zip.js or
 * fflate aren't reliable — notably React Native, where Blob.arrayBuffer()
 * isn't fully implemented and the JS-side zip libs choke. Store-only is
 * fine for EPUB: the format only mandates uncompressed for the `mimetype`
 * entry, and the file size cost of forgoing deflate is small for the
 * mostly-XML payload of a generated EPUB.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Build a store-only ZIP archive from the given entries, returning the
 * raw byte buffer. Entries are written in order; the first entry should
 * be `mimetype` for EPUB compliance.
 */
export function buildStoreOnlyZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();

  let totalSize = 0;
  const nameBytes: Uint8Array[] = [];
  for (const entry of entries) {
    const nb = encoder.encode(entry.name);
    nameBytes.push(nb);
    totalSize += 30 + nb.length + entry.data.length; // local header + data
    totalSize += 46 + nb.length; // central dir header
  }
  totalSize += 22; // end of central dir

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let offset = 0;
  const localOffsets: number[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const nb = nameBytes[i]!;
    const crc = crc32(entry.data);
    localOffsets.push(offset);

    view.setUint32(offset, 0x04034b50, true); offset += 4; // local header sig
    view.setUint16(offset, 20, true); offset += 2;          // version needed
    view.setUint16(offset, 0, true); offset += 2;           // gp flag
    view.setUint16(offset, 0, true); offset += 2;           // method = stored
    view.setUint16(offset, 0, true); offset += 2;           // mod time
    view.setUint16(offset, 0, true); offset += 2;           // mod date
    view.setUint32(offset, crc, true); offset += 4;
    view.setUint32(offset, entry.data.length, true); offset += 4; // compressed
    view.setUint32(offset, entry.data.length, true); offset += 4; // uncompressed
    view.setUint16(offset, nb.length, true); offset += 2;   // name len
    view.setUint16(offset, 0, true); offset += 2;           // extra len
    buf.set(nb, offset); offset += nb.length;
    buf.set(entry.data, offset); offset += entry.data.length;
  }

  const cdStart = offset;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const nb = nameBytes[i]!;
    const crc = crc32(entry.data);

    view.setUint32(offset, 0x02014b50, true); offset += 4; // CD sig
    view.setUint16(offset, 20, true); offset += 2;          // made by
    view.setUint16(offset, 20, true); offset += 2;          // version needed
    view.setUint16(offset, 0, true); offset += 2;           // gp flag
    view.setUint16(offset, 0, true); offset += 2;           // method
    view.setUint16(offset, 0, true); offset += 2;           // mod time
    view.setUint16(offset, 0, true); offset += 2;           // mod date
    view.setUint32(offset, crc, true); offset += 4;
    view.setUint32(offset, entry.data.length, true); offset += 4;
    view.setUint32(offset, entry.data.length, true); offset += 4;
    view.setUint16(offset, nb.length, true); offset += 2;
    view.setUint16(offset, 0, true); offset += 2;           // extra len
    view.setUint16(offset, 0, true); offset += 2;           // comment len
    view.setUint16(offset, 0, true); offset += 2;           // disk #
    view.setUint16(offset, 0, true); offset += 2;           // internal attrs
    view.setUint32(offset, 0, true); offset += 4;           // external attrs
    view.setUint32(offset, localOffsets[i]!, true); offset += 4;
    buf.set(nb, offset); offset += nb.length;
  }

  const cdSize = offset - cdStart;

  view.setUint32(offset, 0x06054b50, true); offset += 4; // EOCD sig
  view.setUint16(offset, 0, true); offset += 2;          // disk #
  view.setUint16(offset, 0, true); offset += 2;          // disk where CD starts
  view.setUint16(offset, entries.length, true); offset += 2;
  view.setUint16(offset, entries.length, true); offset += 2;
  view.setUint32(offset, cdSize, true); offset += 4;
  view.setUint32(offset, cdStart, true); offset += 4;
  view.setUint16(offset, 0, true); offset += 2;          // comment len

  return buf;
}

const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crc32Table[i] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crc32Table[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
