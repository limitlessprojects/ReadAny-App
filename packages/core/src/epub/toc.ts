import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { getPlatformService } from "../services";
import { generateId } from "../utils/generate-id";
import {
  readActiveEpubDraftManifest,
  writeEpubDraftUndoSnapshot,
  type EpubDraftManifest,
} from "./draft";
import {
  findPackageResourcePath,
  inspectEpubBytes,
  resolvePackagePath,
  withEpubPackageResourceReader,
} from "./inspect";
import { readZipTextEntry, replaceZipTextEntry, sha256Hex } from "./zip";

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

type SpineItem = {
  idref: string;
};

type TocRebuildItem = {
  id: string;
  href: string;
  label: string;
  resourcePath: string;
};

export type EpubTocRebuildResult = {
  draftId: string;
  bookId: string;
  navPath: string;
  itemCount: number;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  manifestPath: string;
  historyPath: string;
  items: Array<{
    id: string;
    href: string;
    label: string;
  }>;
};

export async function rebuildEpubTocInDraft(
  draftId: string,
  options: { now?: Date } = {},
): Promise<EpubTocRebuildResult> {
  const platform = getPlatformService();
  const { dataDir, manifestPath, historyPath, manifest } =
    await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const draftBytes = await platform.readFile(draftPath);
  const plan = await buildTocPlan(draftBytes);
  const beforeNav = await readZipTextEntry(draftBytes, plan.navPath);
  if (!beforeNav) {
    throw new Error(`EPUB nav document was not found: ${plan.navPath}`);
  }

  const afterNav = replaceTocNav(beforeNav, plan.items);
  const beforeHash = await sha256Hex(new TextEncoder().encode(beforeNav));
  const afterHash = await sha256Hex(new TextEncoder().encode(afterNav));
  const changed = beforeHash !== afterHash;
  const updatedAt = (options.now ?? new Date()).toISOString();
  const operationId = generateId();

  if (changed) {
    const patchedBytes = await replaceZipTextEntry(draftBytes, plan.navPath, afterNav);
    await platform.writeFile(draftPath, patchedBytes);
    await writeEpubDraftUndoSnapshot(draftId, {
      version: 1,
      operationId,
      action: "epub.toc.rebuild",
      resourcePath: plan.navPath,
      beforeContent: beforeNav,
      beforeHash,
      afterHash,
    });
  }

  const nextManifest: EpubDraftManifest = {
    ...manifest,
    updatedAt,
    inspect: changed
      ? await inspectEpubBytes(await platform.readFile(draftPath))
      : manifest.inspect,
  };
  await platform.writeTextFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);

  await appendHistoryLine(historyPath, {
    id: operationId,
    timestamp: updatedAt,
    action: "epub.toc.rebuild",
    bookId: manifest.bookId,
    draftId,
    beforeHash,
    afterHash,
    itemCount: plan.items.length,
  });

  return {
    draftId,
    bookId: manifest.bookId,
    navPath: plan.navPath,
    itemCount: plan.items.length,
    beforeHash,
    afterHash,
    changed,
    operationId,
    updatedAt,
    manifestPath: `drafts/epub/${draftId}/manifest.json`,
    historyPath: `drafts/epub/${draftId}/history.jsonl`,
    items: plan.items.map(({ id, href, label }) => ({ id, href, label })),
  };
}

async function buildTocPlan(bytes: Uint8Array): Promise<{
  navPath: string;
  items: TocRebuildItem[];
}> {
  return withEpubPackageResourceReader(
    bytes,
    async ({ packagePath, packageDir, entryPaths, readTextEntry }) => {
      const opfXml = await readTextEntry(packagePath);
      if (!opfXml) throw new Error(`EPUB package document was not found: ${packagePath}`);

      const manifestItems = parseManifestItems(opfXml);
      const spineItems = parseSpineItems(opfXml);
      const navItem = manifestItems.find((item) => item.properties?.split(/\s+/).includes("nav"));
      if (!navItem?.href) {
        throw new Error("EPUB package manifest does not contain an EPUB3 nav document.");
      }

      const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
      const items: TocRebuildItem[] = [];
      for (const spine of spineItems) {
        const item = manifestById.get(spine.idref);
        if (!item?.href || !isHtmlMediaType(item.mediaType)) continue;
        const resourcePath =
          findPackageResourcePath(entryPaths, packageDir, item.href) ??
          resolvePackagePath(packageDir, item.href);
        const xml = await readTextEntry(resourcePath);
        items.push({
          id: item.id,
          href: item.href,
          label: xml ? extractChapterLabel(xml, item.id) : item.id,
          resourcePath,
        });
      }

      if (items.length === 0) {
        throw new Error("EPUB spine does not contain readable XHTML chapters for toc rebuild.");
      }

      const navPath =
        findPackageResourcePath(entryPaths, packageDir, navItem.href) ??
        resolvePackagePath(packageDir, navItem.href);
      const navDir = getZipDir(navPath);

      return {
        navPath,
        items: items.map((item) => ({
          ...item,
          href: relativeZipPath(navDir, item.resourcePath),
        })),
      };
    },
  );
}

function replaceTocNav(navXml: string, items: TocRebuildItem[]): string {
  const doc = new DOMParser().parseFromString(navXml, "application/xml") as unknown as Document;
  const nav = findTocNav(doc);
  if (!nav) {
    throw new Error("EPUB nav document does not contain a toc nav.");
  }

  for (const child of Array.from(nav.childNodes)) {
    if (child.nodeType === 1 && (child as Element).localName === "ol") {
      nav.removeChild(child);
    }
  }

  const ol = doc.createElement("ol");
  for (const item of items) {
    const li = doc.createElement("li");
    const anchor = doc.createElement("a");
    anchor.setAttribute("href", item.href);
    anchor.appendChild(doc.createTextNode(item.label));
    li.appendChild(anchor);
    ol.appendChild(li);
  }
  nav.appendChild(ol);

  return new XMLSerializer().serializeToString(doc);
}

function findTocNav(doc: Document): Element | undefined {
  return Array.from(doc.getElementsByTagName("*")).find(
    (element) =>
      element.localName === "nav" &&
      (element.getAttribute("epub:type") || element.getAttribute("type") || "")
        .split(/\s+/)
        .includes("toc"),
  );
}

function parseManifestItems(opfXml: string): ManifestItem[] {
  const doc = new DOMParser().parseFromString(opfXml, "application/xml") as unknown as Document;
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "item")
    .map((element) => ({
      id: element.getAttribute("id") ?? "",
      href: element.getAttribute("href") ?? "",
      mediaType: element.getAttribute("media-type") ?? "",
      properties: element.getAttribute("properties") || undefined,
    }));
}

function parseSpineItems(opfXml: string): SpineItem[] {
  const doc = new DOMParser().parseFromString(opfXml, "application/xml") as unknown as Document;
  return Array.from(doc.getElementsByTagName("*"))
    .filter((element) => element.localName === "itemref")
    .map((element) => ({
      idref: element.getAttribute("idref") ?? "",
    }));
}

function extractChapterLabel(xml: string, fallback: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
  const title = firstText(doc, "title");
  if (title) return title;
  const heading = ["h1", "h2", "h3"].map((localName) => firstText(doc, localName)).find(Boolean);
  return heading || fallback;
}

function firstText(doc: Document, localName: string): string | undefined {
  return (
    Array.from(doc.getElementsByTagName("*"))
      .find((element) => element.localName === localName)
      ?.textContent?.trim() || undefined
  );
}

function isHtmlMediaType(mediaType: string): boolean {
  return mediaType === "application/xhtml+xml" || mediaType === "text/html";
}

function getZipDir(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function relativeZipPath(fromDir: string, targetPath: string): string {
  if (!fromDir) return targetPath;
  const fromParts = fromDir.split("/").filter(Boolean);
  const targetParts = targetPath.split("/").filter(Boolean);
  while (fromParts.length > 0 && targetParts.length > 0 && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  return [...fromParts.map(() => ".."), ...targetParts].join("/");
}

async function appendHistoryLine(path: string, entry: unknown): Promise<void> {
  const platform = getPlatformService();
  const existing = (await platform.exists(path)) ? await platform.readTextFile(path) : "";
  await platform.writeTextFile(path, `${existing}${JSON.stringify(entry)}\n`);
}
