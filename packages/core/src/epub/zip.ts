import {
  TextReader,
  Uint8ArrayReader,
  Uint8ArrayWriter,
  BlobReader,
  ZipReader,
  ZipWriter,
  configure,
} from "@zip.js/zip.js";

configure({ useWebWorkers: false });

export type ZipEntrySummary = {
  path: string;
  size: number;
  sha256: string;
};

type ZipEntryLike = {
  filename: string;
  directory?: boolean;
  getData?: (writer: Uint8ArrayWriter) => Promise<Uint8Array>;
};

export async function summarizeZipEntries(bytes: Uint8Array): Promise<ZipEntrySummary[]> {
  const buffer = toArrayBuffer(bytes);
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));

  try {
    const entries = (await reader.getEntries()) as ZipEntryLike[];
    const summaries: ZipEntrySummary[] = [];
    for (const entry of entries) {
      if (entry.directory || !entry.getData) continue;
      const data = await entry.getData(new Uint8ArrayWriter());
      summaries.push({
        path: entry.filename,
        size: data.byteLength,
        sha256: await sha256Hex(data),
      });
    }
    return summaries.sort((a, b) => a.path.localeCompare(b.path));
  } finally {
    await reader.close();
  }
}

export async function replaceZipTextEntry(
  bytes: Uint8Array,
  targetPath: string,
  content: string,
): Promise<Uint8Array> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));
  const writer = new ZipWriter(new Uint8ArrayWriter(), { extendedTimestamp: false });
  const writeOptions = {
    level: 0,
    lastAccessDate: new Date(0),
    lastModDate: new Date(0),
  };
  let replaced = false;

  try {
    const entries = await reader.getEntries();
    for (const entry of entries) {
      if (entry.directory) {
        await writer.add(entry.filename, undefined, { directory: true });
        continue;
      }

      if (entry.filename === targetPath) {
        await writer.add(entry.filename, new TextReader(content), writeOptions);
        replaced = true;
        continue;
      }

      if (!entry.getData) continue;
      await writer.add(
        entry.filename,
        new Uint8ArrayReader(await entry.getData(new Uint8ArrayWriter())),
        writeOptions,
      );
    }
  } finally {
    await reader.close();
  }

  if (!replaced) {
    await writer.close();
    throw new Error(`EPUB entry was not found: ${targetPath}`);
  }

  return writer.close();
}

export async function readZipTextEntry(
  bytes: Uint8Array,
  targetPath: string,
): Promise<string | null> {
  const reader = new ZipReader(new Uint8ArrayReader(bytes));

  try {
    const entries = (await reader.getEntries()) as ZipEntryLike[];
    const target = entries.find(
      (entry) => !entry.directory && entry.filename === targetPath && entry.getData,
    );
    if (!target?.getData) return null;
    const data = await target.getData(new Uint8ArrayWriter());
    return new TextDecoder().decode(data);
  } finally {
    await reader.close();
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = toArrayBuffer(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}
