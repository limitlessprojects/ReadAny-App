import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { getPlatformService } from "../services";
import { generateId } from "../utils/generate-id";
import {
  readActiveEpubDraftManifest,
  writeEpubDraftUndoSnapshot,
  type EpubDraftManifest,
} from "./draft";
import { inspectEpubBytes, withEpubPackageResourceReader } from "./inspect";
import { replaceZipTextEntry, sha256Hex } from "./zip";

export type EpubMetadataPatch = {
  title?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  description?: string;
  modified?: string;
  subjects?: string[];
};

export type EpubMetadataPatchResult = {
  draftId: string;
  bookId: string;
  packagePath: string;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  fields: string[];
  metadata: EpubDraftManifest["inspect"]["metadata"];
  manifestPath: string;
  historyPath: string;
};

export async function patchEpubMetadataInDraft(
  draftId: string,
  patch: EpubMetadataPatch,
  options: { now?: Date } = {},
): Promise<EpubMetadataPatchResult> {
  const platform = getPlatformService();
  const { dataDir, manifestPath, historyPath, manifest } = await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const fields = getPatchFields(patch);
  if (fields.length === 0) {
    throw new Error("EPUB metadata patch must include at least one supported field.");
  }

  const draftBytes = await platform.readFile(draftPath);
  const packageResource = await readPackageResource(draftBytes);
  const nextOpf = applyMetadataPatch(packageResource.content, patch);
  const beforeHash = await sha256Hex(new TextEncoder().encode(packageResource.content));
  const afterHash = await sha256Hex(new TextEncoder().encode(nextOpf));
  const changed = beforeHash !== afterHash;
  const updatedAt = (options.now ?? new Date()).toISOString();
  const operationId = generateId();

  if (changed) {
    const patchedBytes = await replaceZipTextEntry(draftBytes, packageResource.packagePath, nextOpf);
    await platform.writeFile(draftPath, patchedBytes);
    await writeEpubDraftUndoSnapshot(draftId, {
      version: 1,
      operationId,
      action: "epub.metadata.patch",
      resourcePath: packageResource.packagePath,
      beforeContent: packageResource.content,
      beforeHash,
      afterHash,
    });
  }

  const inspected = changed ? await inspectEpubBytes(await platform.readFile(draftPath)) : manifest.inspect;
  const nextManifest: EpubDraftManifest = {
    ...manifest,
    updatedAt,
    inspect: inspected,
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  await appendHistoryLine(historyPath, {
    id: operationId,
    timestamp: updatedAt,
    action: "epub.metadata.patch",
    bookId: manifest.bookId,
    draftId,
    beforeHash,
    afterHash,
    fields,
  });

  return {
    draftId,
    bookId: manifest.bookId,
    packagePath: packageResource.packagePath,
    beforeHash,
    afterHash,
    changed,
    operationId,
    updatedAt,
    fields,
    metadata: inspected.metadata,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
  };
}

async function readPackageResource(bytes: Uint8Array): Promise<{
  packagePath: string;
  content: string;
}> {
  return withEpubPackageResourceReader(bytes, async ({ packagePath, readTextEntry }) => {
    const content = await readTextEntry(packagePath);
    if (!content) throw new Error(`EPUB package document was not found: ${packagePath}`);
    return { packagePath, content };
  });
}

function applyMetadataPatch(opfXml: string, patch: EpubMetadataPatch): string {
  const doc = new DOMParser().parseFromString(opfXml, "application/xml") as unknown as Document;
  const metadata = Array.from(doc.getElementsByTagName("*")).find(
    (element) => element.localName === "metadata",
  );
  if (!metadata) {
    throw new Error("EPUB package document does not contain metadata.");
  }

  updateDcElement(doc, metadata, "title", patch.title);
  updateDcElement(doc, metadata, "creator", patch.creator);
  updateDcElement(doc, metadata, "language", patch.language);
  updateDcElement(doc, metadata, "publisher", patch.publisher);
  updateDcElement(doc, metadata, "description", patch.description);
  updateSubjects(doc, metadata, patch.subjects);
  updateModified(doc, metadata, patch.modified);

  return new XMLSerializer().serializeToString(doc);
}

function updateDcElement(
  doc: Document,
  metadata: Element,
  localName: string,
  value: string | undefined,
): void {
  if (value === undefined) return;
  const element = findMetadataElement(metadata, localName) ?? createDcElement(doc, localName);
  element.textContent = value;
  if (!element.parentNode) metadata.appendChild(element);
}

function updateSubjects(doc: Document, metadata: Element, subjects: string[] | undefined): void {
  if (!subjects) return;
  for (const subject of Array.from(metadata.getElementsByTagName("*")).filter(
    (element) => element.localName === "subject",
  )) {
    metadata.removeChild(subject);
  }
  for (const subject of subjects.map((item) => item.trim()).filter(Boolean)) {
    const element = createDcElement(doc, "subject");
    element.textContent = subject;
    metadata.appendChild(element);
  }
}

function updateModified(doc: Document, metadata: Element, modified: string | undefined): void {
  if (modified === undefined) return;
  const element = Array.from(metadata.getElementsByTagName("*")).find(
    (candidate) =>
      candidate.localName === "meta" && candidate.getAttribute("property") === "dcterms:modified",
  ) ?? doc.createElement("meta");
  element.setAttribute("property", "dcterms:modified");
  element.textContent = modified;
  if (!element.parentNode) metadata.appendChild(element);
}

function findMetadataElement(metadata: Element, localName: string): Element | undefined {
  return Array.from(metadata.getElementsByTagName("*")).find(
    (element) => element.localName === localName,
  );
}

function createDcElement(doc: Document, localName: string): Element {
  return doc.createElementNS("http://purl.org/dc/elements/1.1/", `dc:${localName}`);
}

function getPatchFields(patch: EpubMetadataPatch): string[] {
  const fields: string[] = [];
  for (const field of [
    "title",
    "creator",
    "language",
    "publisher",
    "description",
    "modified",
    "subjects",
  ] as const) {
    if (patch[field] !== undefined) fields.push(field);
  }
  return fields;
}

async function appendHistoryLine(path: string, entry: unknown): Promise<void> {
  const platform = getPlatformService();
  const existing = (await platform.exists(path)) ? await platform.readTextFile(path) : "";
  await platform.writeTextFile(path, `${existing}${JSON.stringify(entry)}\n`);
}
