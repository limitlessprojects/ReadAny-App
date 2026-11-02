import { DOMParser } from "@xmldom/xmldom";
import { getPlatformService } from "../services";
import { readActiveEpubDraftManifest } from "./draft";
import {
  findPackageResourcePath,
  inspectEpubBytes,
  resolvePackagePath,
  withEpubPackageResourceReader,
  type EpubInspectResult,
} from "./inspect";
import { sha256Hex } from "./zip";

export type EpubValidationIssueSeverity = "error" | "warning";

export type EpubValidationIssue = {
  severity: EpubValidationIssueSeverity;
  code: string;
  message: string;
  path?: string;
  id?: string;
};

export type EpubValidationResult = {
  draftId: string;
  bookId: string;
  valid: boolean;
  checkedAt: string;
  draftFilePath: string;
  draftHash: string;
  packagePath?: string;
  manifestItemCount: number;
  spineItemCount: number;
  tocItemCount: number;
  errorCount: number;
  warningCount: number;
  issues: EpubValidationIssue[];
};

export async function validateEpubDraft(
  draftId: string,
  options: { now?: Date } = {},
): Promise<EpubValidationResult> {
  const platform = getPlatformService();
  const { dataDir, manifest } = await readActiveEpubDraftManifest(draftId);
  const draftPath = await platform.joinPath(dataDir, manifest.draftFilePath);
  if (!(await platform.exists(draftPath))) {
    throw new Error(`EPUB draft file was not found: ${manifest.draftFilePath}`);
  }

  const draftBytes = await platform.readFile(draftPath);
  const issues: EpubValidationIssue[] = [];
  let inspect: EpubInspectResult | undefined;

  try {
    inspect = await inspectEpubBytes(draftBytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({
      severity: "error",
      code: "epub_parse_failed",
      message,
    });
  }

  if (inspect) {
    issues.push(...validateInspectResult(inspect));
    issues.push(...(await validateResourceReferences(draftBytes, inspect)));
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    draftId,
    bookId: manifest.bookId,
    valid: errorCount === 0,
    checkedAt: (options.now ?? new Date()).toISOString(),
    draftFilePath: manifest.draftFilePath,
    draftHash: await sha256Hex(draftBytes),
    packagePath: inspect?.packagePath,
    manifestItemCount: inspect?.manifest.count ?? 0,
    spineItemCount: inspect?.spine.count ?? 0,
    tocItemCount: inspect?.toc.count ?? 0,
    errorCount,
    warningCount,
    issues,
  };
}

function validateInspectResult(inspect: EpubInspectResult): EpubValidationIssue[] {
  const issues: EpubValidationIssue[] = [];
  if (!inspect.metadata.title) {
    issues.push({
      severity: "warning",
      code: "missing_title",
      message: "EPUB metadata does not include a title.",
      path: inspect.packagePath,
    });
  }
  if (!inspect.metadata.language) {
    issues.push({
      severity: "warning",
      code: "missing_language",
      message: "EPUB metadata does not include a language.",
      path: inspect.packagePath,
    });
  }
  if (inspect.manifest.count === 0) {
    issues.push({
      severity: "error",
      code: "empty_manifest",
      message: "EPUB package manifest is empty.",
      path: inspect.packagePath,
    });
  }
  if (inspect.spine.count === 0) {
    issues.push({
      severity: "error",
      code: "empty_spine",
      message: "EPUB package spine is empty.",
      path: inspect.packagePath,
    });
  }

  const manifestIds = new Set<string>();
  for (const item of inspect.manifest.items) {
    if (!item.id) {
      issues.push({
        severity: "error",
        code: "manifest_item_missing_id",
        message: "EPUB manifest item is missing an id.",
        path: inspect.packagePath,
      });
      continue;
    }
    if (manifestIds.has(item.id)) {
      issues.push({
        severity: "error",
        code: "duplicate_manifest_id",
        message: `EPUB manifest id is duplicated: ${item.id}`,
        path: inspect.packagePath,
        id: item.id,
      });
    }
    manifestIds.add(item.id);
    if (!item.href) {
      issues.push({
        severity: "error",
        code: "manifest_item_missing_href",
        message: `EPUB manifest item is missing href: ${item.id}`,
        path: inspect.packagePath,
        id: item.id,
      });
    }
    if (!item.mediaType) {
      issues.push({
        severity: "warning",
        code: "manifest_item_missing_media_type",
        message: `EPUB manifest item is missing media-type: ${item.id}`,
        path: inspect.packagePath,
        id: item.id,
      });
    }
  }

  for (const item of inspect.spine.items) {
    if (!item.idref || !manifestIds.has(item.idref)) {
      issues.push({
        severity: "error",
        code: "spine_idref_missing_manifest_item",
        message: `EPUB spine references a missing manifest item: ${item.idref || "(empty)"}`,
        path: inspect.packagePath,
        id: item.idref || undefined,
      });
    }
  }

  return issues;
}

async function validateResourceReferences(
  bytes: Uint8Array,
  inspect: EpubInspectResult,
): Promise<EpubValidationIssue[]> {
  return withEpubPackageResourceReader(bytes, async ({ packageDir, entryPaths, readTextEntry }) => {
    const issues: EpubValidationIssue[] = [];
    const entrySet = new Set(entryPaths);
    const lowerEntryMap = new Map(
      entryPaths.map((entryPath) => [entryPath.toLowerCase(), entryPath]),
    );
    const manifestByHref = new Map<string, string>();

    for (const item of inspect.manifest.items) {
      if (!item.href) continue;
      const resourcePath =
        findPackageResourcePath(entryPaths, packageDir, item.href) ??
        resolvePackagePath(packageDir, item.href);
      manifestByHref.set(resourcePath, item.id);
      if (!entrySet.has(resourcePath)) {
        issues.push({
          severity: "error",
          code: "manifest_resource_missing",
          message: `EPUB manifest resource is missing from the archive: ${item.href}`,
          path: resourcePath,
          id: item.id,
        });
      }
    }

    for (const item of inspect.toc.items) {
      if (!item.href) continue;
      const href = stripFragment(item.href);
      const resourcePath = findPackageResourcePath(entryPaths, packageDir, href);
      if (!resourcePath) {
        issues.push({
          severity: "error",
          code: "toc_href_missing_resource",
          message: `EPUB table of contents references a missing resource: ${item.href}`,
          path: resourcePath ?? resolvePackagePath(packageDir, href),
        });
      }
    }

    for (const item of inspect.manifest.items) {
      if (!item.href || !isHtmlMediaType(item.mediaType)) continue;
      const resourcePath = findPackageResourcePath(entryPaths, packageDir, item.href);
      if (!resourcePath) continue;
      const xml = await readTextEntry(resourcePath);
      if (!xml) continue;
      issues.push(
        ...validateHtmlResourceLinks({
          resourcePath,
          xml,
          entrySet,
          lowerEntryMap,
          manifestByHref,
        }),
      );
    }

    return issues;
  });
}

function validateHtmlResourceLinks(options: {
  resourcePath: string;
  xml: string;
  entrySet: Set<string>;
  lowerEntryMap: Map<string, string>;
  manifestByHref: Map<string, string>;
}): EpubValidationIssue[] {
  const issues: EpubValidationIssue[] = [];
  const doc = new DOMParser().parseFromString(
    options.xml,
    "application/xml",
  ) as unknown as Document;
  const elements = Array.from(doc.getElementsByTagName("*"));
  for (const element of elements) {
    const rawHref =
      element.getAttribute("href") ??
      element.getAttribute("src") ??
      element.getAttribute("xlink:href");
    if (!rawHref || shouldIgnoreHref(rawHref)) continue;
    const targets = resolveRelativePathCandidates(options.resourcePath, stripFragment(rawHref));
    if (!findExistingEntryPath(targets, options.entrySet, options.lowerEntryMap)) {
      issues.push({
        severity: "error",
        code: "resource_reference_missing",
        message: `EPUB resource references a missing archive entry: ${rawHref}`,
        path: options.resourcePath,
        id: options.manifestByHref.get(options.resourcePath),
      });
    }
  }
  return issues;
}

function isHtmlMediaType(mediaType: string): boolean {
  return mediaType === "application/xhtml+xml" || mediaType === "text/html";
}

function stripFragment(href: string): string {
  return href.split("#")[0] ?? "";
}

function shouldIgnoreHref(href: string): boolean {
  return (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("data:") ||
    href.startsWith("kindle:")
  );
}

function resolveRelativePathCandidates(fromPath: string, relativePath: string): string[] {
  const candidates = [normalizeRelativePath(fromPath, relativePath)];
  const decodedRelativePath = safeDecodeURIComponent(relativePath);
  if (decodedRelativePath && decodedRelativePath !== relativePath) {
    candidates.push(normalizeRelativePath(fromPath, decodedRelativePath));
  }
  return Array.from(new Set(candidates));
}

function findExistingEntryPath(
  candidates: string[],
  entrySet: Set<string>,
  lowerEntryMap: Map<string, string>,
): string | undefined {
  const exact = candidates.find((candidate) => entrySet.has(candidate));
  if (exact) return exact;
  return candidates
    .map((candidate) => lowerEntryMap.get(candidate.toLowerCase()))
    .find((entryPath): entryPath is string => Boolean(entryPath));
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function normalizeRelativePath(fromPath: string, relativePath: string): string {
  if (!relativePath) return fromPath;
  const base = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  for (const part of `${base}${relativePath}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}
