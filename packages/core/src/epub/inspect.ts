import { DOMParser } from "@xmldom/xmldom";
import { BlobReader, TextWriter, ZipReader, configure } from "@zip.js/zip.js";
import { toArrayBuffer } from "./zip";

export type EpubInspectManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

export type EpubInspectSpineItem = {
  idref: string;
  linear?: string;
  href?: string;
  mediaType?: string;
};

export type EpubInspectTocItem = {
  label: string;
  href: string;
  level: number;
};

export type EpubInspectResult = {
  format: "epub";
  packagePath: string;
  version?: string;
  metadata: {
    title?: string;
    creator?: string;
    language?: string;
    identifier?: string;
    publisher?: string;
    description?: string;
    modified?: string;
    subjects: string[];
  };
  manifest: {
    count: number;
    items: EpubInspectManifestItem[];
  };
  spine: {
    count: number;
    toc?: string;
    items: EpubInspectSpineItem[];
  };
  toc: {
    count: number;
    items: EpubInspectTocItem[];
  };
};

type ZipEntryLike = {
  filename: string;
  directory?: boolean;
  getData?: (writer: TextWriter) => Promise<string>;
};

export type EpubPackageResourceReader = {
  packagePath: string;
  packageDir: string;
  entryPaths: string[];
  readTextEntry: (path: string) => Promise<string | null>;
};

configure({ useWebWorkers: false });

export async function inspectEpubBytes(bytes: Uint8Array): Promise<EpubInspectResult> {
  return withEpubPackageResourceReader(
    bytes,
    async ({ packagePath, entryPaths, readTextEntry }) => {
      const opfXml = await readTextEntry(packagePath);
      if (!opfXml) {
        throw new Error(`EPUB package document was not found: ${packagePath}`);
      }

      return inspectPackageDocument({ opfXml, packagePath, entryPaths, readTextEntry });
    },
  );
}

export async function withEpubPackageResourceReader<T>(
  bytes: Uint8Array,
  callback: (reader: EpubPackageResourceReader) => Promise<T>,
): Promise<T> {
  const buffer = toArrayBuffer(bytes);
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));

  try {
    const entries = (await reader.getEntries()) as ZipEntryLike[];
    const readTextEntry = createEntryReader(entries);
    const containerXml = await readTextEntry("META-INF/container.xml");
    if (!containerXml) {
      throw new Error("EPUB container.xml was not found.");
    }

    const packagePath = parsePackagePath(containerXml);
    const packageDir = getPackageDir(packagePath);
    return callback({
      packagePath,
      packageDir,
      entryPaths: entries.filter((entry) => !entry.directory).map((entry) => entry.filename),
      readTextEntry,
    });
  } finally {
    await reader.close();
  }
}

function createEntryReader(entries: ZipEntryLike[]) {
  const entryMap = new Map(entries.map((entry) => [entry.filename, entry]));
  return async (path: string): Promise<string | null> => {
    let entry = entryMap.get(path);
    if (!entry) {
      const lower = path.toLowerCase();
      entry = entries.find((candidate) => candidate.filename.toLowerCase() === lower);
    }
    if (!entry || entry.directory || !entry.getData) return null;
    return entry.getData(new TextWriter());
  };
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml") as unknown as Document;
}

function elementsByLocalName(root: Document | Element, localName?: string): Element[] {
  const elements = Array.from(root.getElementsByTagName("*"));
  if (!localName || localName === "*") return elements;
  return elements.filter((element) => element.localName === localName);
}

function parsePackagePath(containerXml: string): string {
  const doc = parseXml(containerXml);
  const rootfile = elementsByLocalName(doc, "rootfile")[0];
  const packagePath = rootfile?.getAttribute("full-path")?.trim();
  if (!packagePath) {
    throw new Error("EPUB container.xml does not declare a package document.");
  }
  return packagePath;
}

async function inspectPackageDocument(options: {
  opfXml: string;
  packagePath: string;
  entryPaths: string[];
  readTextEntry: (path: string) => Promise<string | null>;
}): Promise<EpubInspectResult> {
  const doc = parseXml(options.opfXml);
  const packageElement = doc.documentElement;
  const packageDir = getPackageDir(options.packagePath);
  const manifestItems = elementsByLocalName(doc, "item").map((item) => ({
    id: item.getAttribute("id") ?? "",
    href: item.getAttribute("href") ?? "",
    mediaType: item.getAttribute("media-type") ?? "",
    properties: item.getAttribute("properties") || undefined,
  }));
  const manifestById = new Map(manifestItems.map((item) => [item.id, item]));
  const spineElement = elementsByLocalName(doc, "spine")[0];
  const spineItems = elementsByLocalName(spineElement ?? doc, "itemref").map((itemref) => {
    const idref = itemref.getAttribute("idref") ?? "";
    const manifestItem = manifestById.get(idref);
    return {
      idref,
      linear: itemref.getAttribute("linear") || undefined,
      href: manifestItem?.href,
      mediaType: manifestItem?.mediaType,
    };
  });
  const tocItems = await extractTocItems({
    manifestItems,
    packageDir,
    spineTocId: spineElement?.getAttribute("toc") || undefined,
    entryPaths: options.entryPaths,
    readTextEntry: options.readTextEntry,
  });

  return {
    format: "epub",
    packagePath: options.packagePath,
    version: packageElement.getAttribute("version") || undefined,
    metadata: parseMetadata(doc),
    manifest: {
      count: manifestItems.length,
      items: manifestItems.slice(0, 100),
    },
    spine: {
      count: spineItems.length,
      toc: spineElement?.getAttribute("toc") || undefined,
      items: spineItems.slice(0, 100),
    },
    toc: {
      count: tocItems.length,
      items: tocItems.slice(0, 100),
    },
  };
}

function parseMetadata(doc: Document): EpubInspectResult["metadata"] {
  const metadata = elementsByLocalName(doc, "metadata")[0] ?? doc.documentElement;
  const metadataElements = elementsByLocalName(metadata);
  const textByLocalName = (localName: string) =>
    metadataElements.find((element) => element.localName === localName)?.textContent?.trim() ||
    undefined;
  const metaByProperty = (property: string) =>
    metadataElements
      .find(
        (element) => element.localName === "meta" && element.getAttribute("property") === property,
      )
      ?.textContent?.trim() || undefined;

  return {
    title: textByLocalName("title"),
    creator: textByLocalName("creator"),
    language: textByLocalName("language"),
    identifier: textByLocalName("identifier"),
    publisher: textByLocalName("publisher"),
    description: textByLocalName("description"),
    modified: metaByProperty("dcterms:modified"),
    subjects: metadataElements
      .filter((element) => element.localName === "subject")
      .map((element) => element.textContent?.trim() || "")
      .filter(Boolean),
  };
}

async function extractTocItems(options: {
  manifestItems: EpubInspectManifestItem[];
  packageDir: string;
  spineTocId?: string;
  entryPaths: string[];
  readTextEntry: (path: string) => Promise<string | null>;
}): Promise<EpubInspectTocItem[]> {
  const navItem = options.manifestItems.find((item) =>
    item.properties?.split(/\s+/).includes("nav"),
  );
  if (navItem?.href) {
    const navPath = findPackageResourcePath(options.entryPaths, options.packageDir, navItem.href);
    const navXml = navPath ? await options.readTextEntry(navPath) : null;
    if (navXml) return parseNavDocument(navXml);
  }

  const ncxItem = options.spineTocId
    ? options.manifestItems.find((item) => item.id === options.spineTocId)
    : options.manifestItems.find((item) => item.mediaType === "application/x-dtbncx+xml");
  if (ncxItem?.href) {
    const ncxPath = findPackageResourcePath(options.entryPaths, options.packageDir, ncxItem.href);
    const ncxXml = ncxPath ? await options.readTextEntry(ncxPath) : null;
    if (ncxXml) return parseNcxDocument(ncxXml);
  }

  return [];
}

function parseNavDocument(navXml: string): EpubInspectTocItem[] {
  const doc = parseXml(navXml);
  const navs = elementsByLocalName(doc, "nav");
  const tocNav =
    navs.find((nav) => (nav.getAttribute("epub:type") || nav.getAttribute("type")) === "toc") ??
    navs[0];
  if (!tocNav) return [];
  const items: EpubInspectTocItem[] = [];
  collectNavLinks(tocNav, 0, items);
  return items;
}

function collectNavLinks(element: Element, level: number, items: EpubInspectTocItem[]): void {
  for (const child of childElements(element)) {
    if (child.localName === "a") {
      const label = child.textContent?.trim() || "";
      const href = child.getAttribute("href") || "";
      if (label || href) items.push({ label, href, level });
      continue;
    }
    collectNavLinks(child, child.localName === "ol" ? level + 1 : level, items);
  }
}

function parseNcxDocument(ncxXml: string): EpubInspectTocItem[] {
  const doc = parseXml(ncxXml);
  return elementsByLocalName(doc, "navPoint").map((navPoint) => ({
    label:
      elementsByLocalName(navPoint, "text")[0]?.textContent?.trim() ||
      navPoint.getAttribute("id") ||
      "",
    href: elementsByLocalName(navPoint, "content")[0]?.getAttribute("src") || "",
    level: countAncestorNavPoints(navPoint),
  }));
}

function countAncestorNavPoints(element: Element): number {
  let level = 0;
  let parent = element.parentElement;
  while (parent) {
    if (parent.localName === "navPoint") level += 1;
    parent = parent.parentElement;
  }
  return level;
}

function childElements(element: Element): Element[] {
  return Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1);
}

export function resolvePackagePath(packageDir: string, href: string): string {
  if (!packageDir) return href;
  return `${packageDir}${href}`.replace(/\/{2,}/g, "/");
}

export function getPackageDir(packagePath: string): string {
  return packagePath.includes("/") ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1) : "";
}

export function resolvePackagePathCandidates(packageDir: string, href: string): string[] {
  const candidates = [resolvePackagePath(packageDir, href)];
  const decodedHref = safeDecodeURIComponent(href);
  if (decodedHref && decodedHref !== href) {
    candidates.push(resolvePackagePath(packageDir, decodedHref));
  }
  return unique(candidates);
}

export function findPackageResourcePath(
  entryPaths: string[],
  packageDir: string,
  href: string,
): string | undefined {
  const candidates = resolvePackagePathCandidates(packageDir, href);
  const entrySet = new Set(entryPaths);
  const exact = candidates.find((candidate) => entrySet.has(candidate));
  if (exact) return exact;

  const lowerEntries = new Map(entryPaths.map((entryPath) => [entryPath.toLowerCase(), entryPath]));
  return candidates
    .map((candidate) => lowerEntries.get(candidate.toLowerCase()))
    .find((entryPath): entryPath is string => Boolean(entryPath));
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
