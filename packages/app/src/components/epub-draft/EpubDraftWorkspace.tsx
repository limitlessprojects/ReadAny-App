import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@readany/core/utils";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  FileDiff,
  History,
  ListTree,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type CliRunResult = {
  ok: boolean;
  action: string;
  command: string;
  command_source?: string;
  args: string[];
  status?: number | null;
  stdout: string;
  stderr: string;
};

type CommandResult<T> =
  | {
      ok: true;
      data: T;
      warnings?: string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

type EpubDraftHistoryEntry = {
  id: string;
  timestamp: string;
  action: string;
  chapterId?: string;
  href?: string;
  fields?: string[];
  itemCount?: number;
  operationId?: string;
  undoneAction?: string;
};

type EpubDraftHistoryResult = {
  draftId: string;
  bookId: string;
  status: string;
  entries: EpubDraftHistoryEntry[];
};

type EpubDiffEntry = {
  path: string;
  status: "added" | "removed" | "modified" | "unchanged";
  sourceSize?: number;
  draftSize?: number;
};

type EpubDiffResult = {
  draftId: string;
  bookId: string;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  unchangedCount: number;
  entries: EpubDiffEntry[];
};

type EpubValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
};

type EpubValidationResult = {
  draftId: string;
  bookId: string;
  valid: boolean;
  checkedAt: string;
  manifestItemCount: number;
  spineItemCount: number;
  tocItemCount: number;
  errorCount: number;
  warningCount: number;
  issues: EpubValidationIssue[];
};

type EpubInspectSpineItem = {
  idref: string;
  linear?: string;
  href?: string;
  mediaType?: string;
};

type EpubInspectTocItem = {
  label: string;
  href: string;
  level: number;
};

type EpubInspectResult = {
  bookId: string;
  packagePath: string;
  metadata: {
    title?: string;
    creator?: string;
    language?: string;
    publisher?: string;
    description?: string;
    modified?: string;
    subjects: string[];
  };
  spine: {
    count: number;
    items: EpubInspectSpineItem[];
  };
  toc: {
    count: number;
    items: EpubInspectTocItem[];
  };
};

type EpubChapterReadResult = {
  source: "draft" | "book";
  id: string;
  href: string;
  mediaType?: string;
  title?: string;
  contentFormat: "text" | "xhtml";
  content: string;
  contentTruncated: boolean;
  contentLimit: number;
  draftId?: string;
  bookId?: string;
};

type EpubChapterPatchResult = {
  draftId: string;
  bookId: string;
  chapterId: string;
  href: string;
  resourcePath: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  title?: string;
};

type EpubMetadataPatch = {
  title?: string;
  creator?: string;
  language?: string;
  publisher?: string;
  description?: string;
  subjects?: string[];
};

type EpubMetadataDraft = {
  title: string;
  creator: string;
  language: string;
  publisher: string;
  description: string;
  subjects: string;
};

type EpubMetadataPatchResult = {
  draftId: string;
  bookId: string;
  packagePath: string;
  changed: boolean;
  operationId: string;
  updatedAt: string;
  fields: string[];
  metadata: EpubInspectResult["metadata"];
};

type EpubTocRebuildResult = {
  draftId: string;
  bookId: string;
  operationId: string;
  changed: boolean;
};

type EpubUndoResult = {
  draftId: string;
  bookId: string;
  operationId: string;
  undoneAction: string;
  undoOperationId: string;
  changed: boolean;
};

type EpubDiscardResult = {
  draftId: string;
  bookId: string;
  status: "discarded";
  operationId: string;
  discardedAt: string;
};

type EpubExportResult = {
  draftId: string;
  bookId: string;
  outputPath: string;
  outputHash: string;
  outputSize: number;
  exportedAt: string;
  validation: EpubValidationResult;
};

type DraftWorkspaceSnapshot = {
  history?: EpubDraftHistoryResult;
  diff?: EpubDiffResult;
  validation?: EpubValidationResult;
  inspect?: EpubInspectResult;
  raw: Partial<Record<"history" | "diff" | "validation" | "inspect", unknown>>;
};

interface EpubDraftWorkspaceProps {
  draftId: string;
}

function parseCliJson<T>(result: CliRunResult): CommandResult<T> {
  const output = result.stdout.trim();
  if (!output) {
    return {
      ok: false,
      error: {
        code: "empty_cli_output",
        message: result.stderr.trim() || "ReadAny CLI returned no JSON output.",
      },
    };
  }

  try {
    const parsed = JSON.parse(output) as CommandResult<T>;
    if (!result.ok && parsed.ok) {
      return {
        ok: false,
        error: {
          code: "cli_failed",
          message: result.stderr.trim() || "ReadAny CLI command failed.",
          details: parsed,
        },
      };
    }
    return parsed;
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "invalid_cli_json",
        message: error instanceof Error ? error.message : String(error),
        details: output.slice(0, 500),
      },
    };
  }
}

function unwrapCommand<T>(result: CliRunResult, key: string): T {
  const parsed = parseCliJson<Record<string, T>>(result);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  const value = parsed.data[key];
  if (!value) {
    throw new Error(`ReadAny CLI response did not include ${key}.`);
  }
  return value;
}

async function runDraftAction(
  action: string,
  draftId: string,
  options: Record<string, unknown> = {},
): Promise<CliRunResult> {
  return invoke<CliRunResult>("readany_cli_run", {
    action,
    options: { draftId, ...options },
  });
}

async function loadDraftCommand<T>(
  action: string,
  draftId: string,
  key: string,
  options: Record<string, unknown> = {},
): Promise<{ value?: T; error?: string }> {
  try {
    return { value: unwrapCommand<T>(await runDraftAction(action, draftId, options), key) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function formatDateTime(value: string, locale: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value || "-";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function stripHrefFragment(value: string) {
  return value.split("#")[0];
}

function chapterTitleForItem(
  item: EpubInspectSpineItem,
  index: number,
  tocByHref: Map<string, string>,
) {
  if (item.href) {
    const label = tocByHref.get(stripHrefFragment(item.href));
    if (label) return label;
  }
  return item.idref || `Chapter ${index + 1}`;
}

function metadataToDraft(metadata?: EpubInspectResult["metadata"]): EpubMetadataDraft {
  return {
    title: metadata?.title ?? "",
    creator: metadata?.creator ?? "",
    language: metadata?.language ?? "",
    publisher: metadata?.publisher ?? "",
    description: metadata?.description ?? "",
    subjects: metadata?.subjects?.join("\n") ?? "",
  };
}

function metadataDraftToPatch(draft: EpubMetadataDraft): EpubMetadataPatch {
  return {
    title: draft.title,
    creator: draft.creator,
    language: draft.language,
    publisher: draft.publisher,
    description: draft.description,
    subjects: draft.subjects
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function defaultExportName(snapshot: DraftWorkspaceSnapshot) {
  const title = snapshot.inspect?.metadata.title?.trim() || snapshot.history?.bookId || "readany-draft";
  return `${title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "readany-draft"}.epub`;
}

export function EpubDraftWorkspace({ draftId }: EpubDraftWorkspaceProps) {
  const { t, i18n } = useTranslation();
  const [draftIdInput, setDraftIdInput] = useState(draftId);
  const [activeDraftId, setActiveDraftId] = useState(draftId);
  const [snapshot, setSnapshot] = useState<DraftWorkspaceSnapshot>({ raw: {} });
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [chapterDraft, setChapterDraft] = useState<EpubChapterReadResult | null>(null);
  const [chapterContent, setChapterContent] = useState("");
  const [chapterDirty, setChapterDirty] = useState(false);
  const [metadataDraft, setMetadataDraft] = useState<EpubMetadataDraft>(metadataToDraft());
  const [metadataDirty, setMetadataDirty] = useState(false);

  useEffect(() => {
    setDraftIdInput(draftId);
    setActiveDraftId(draftId);
  }, [draftId]);

  const loadWorkspace = useCallback(
    async (targetDraftId: string) => {
      const normalizedDraftId = targetDraftId.trim();
      if (!normalizedDraftId) {
        toast.error(t("epubDraft.missingDraftId", "请输入 draft id"));
        return;
      }

      setLoading(true);
      setLastError(null);
      try {
        const [historyResult, diffResult, validationResult] = await Promise.all([
          loadDraftCommand<EpubDraftHistoryResult>("epub_history", normalizedDraftId, "history"),
          loadDraftCommand<EpubDiffResult>("epub_diff", normalizedDraftId, "diff"),
          loadDraftCommand<EpubValidationResult>("epub_validate", normalizedDraftId, "validation"),
        ]);
        const inspectResult = historyResult.value?.bookId
          ? await loadDraftCommand<EpubInspectResult>(
              "epub_inspect",
              normalizedDraftId,
              "epub",
              { bookId: historyResult.value.bookId },
            )
          : { error: t("epubDraft.inspectNeedsHistory", "History is required before inspect.") };

        const errors = [
          historyResult.error,
          diffResult.error,
          validationResult.error,
          inspectResult.error,
        ].filter(Boolean);
        setSnapshot({
          history: historyResult.value,
          diff: diffResult.value,
          validation: validationResult.value,
          inspect: inspectResult.value,
          raw: {
            history: historyResult.value,
            diff: diffResult.value,
            validation: validationResult.value,
            inspect: inspectResult.value,
          },
        });
        setActiveDraftId(normalizedDraftId);
        setLastError(errors.length ? errors.join("\n") : null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadWorkspace(draftId);
  }, [draftId, loadWorkspace]);

  useEffect(() => {
    if (!metadataDirty) {
      setMetadataDraft(metadataToDraft(snapshot.inspect?.metadata));
    }
  }, [metadataDirty, snapshot.inspect?.metadata]);

  const changedEntries = useMemo(
    () => snapshot.diff?.entries.filter((entry) => entry.status !== "unchanged").slice(0, 80) ?? [],
    [snapshot.diff?.entries],
  );

  const chapterOptions = useMemo(
    () => {
      const tocByHref = new Map(
        snapshot.inspect?.toc.items.map((item) => [stripHrefFragment(item.href), item.label]) ?? [],
      );
      return (
        snapshot.inspect?.spine.items
          .filter((item) => item.idref && item.linear !== "no" && item.mediaType?.includes("html"))
          .map((item, index) => ({
            id: item.idref,
            label: chapterTitleForItem(item, index, tocByHref),
            href: item.href ?? "",
          })) ?? []
      );
    },
    [snapshot.inspect?.spine.items, snapshot.inspect?.toc.items],
  );

  const undoableEntries = useMemo(
    () => {
      const undoneOperationIds = new Set(
        snapshot.history?.entries
          .filter((entry) => entry.action === "epub.undo" && entry.operationId)
          .map((entry) => entry.operationId),
      );
      return (
        snapshot.history?.entries
          .filter((entry) =>
            ["epub.chapter.patch", "epub.metadata.patch", "epub.toc.rebuild"].includes(
              entry.action,
            ),
          )
          .filter((entry) => !undoneOperationIds.has(entry.id)) ?? []
      );
    },
    [snapshot.history?.entries],
  );

  const runWorkspaceMutation = async <T,>(
    action: string,
    key: string,
    options: Record<string, unknown> = {},
  ): Promise<T | null> => {
    setActionBusy(action);
    setLastError(null);
    try {
      const result = unwrapCommand<T>(await runDraftAction(action, activeDraftId, options), key);
      await loadWorkspace(activeDraftId);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      toast.error(message);
      return null;
    } finally {
      setActionBusy(null);
    }
  };

  const handleRebuildToc = async () => {
    const result = await runWorkspaceMutation<EpubTocRebuildResult>("epub_toc_rebuild", "toc");
    if (result) {
      toast.success(
        result.changed
          ? t("epubDraft.tocRebuilt", "TOC rebuilt")
          : t("epubDraft.tocAlreadyClean", "TOC already up to date"),
      );
    }
  };

  const handleUndo = async (operationId: string) => {
    const result = await runWorkspaceMutation<EpubUndoResult>("epub_undo", "undo", {
      operationId,
    });
    if (result) {
      toast.success(t("epubDraft.undoComplete", "Undo complete"));
    }
  };

  const handleLoadChapter = async () => {
    if (!selectedChapterId) {
      toast.error(t("epubDraft.selectChapterFirst", "Select a chapter first"));
      return;
    }
    setActionBusy("epub_chapter_read");
    setLastError(null);
    try {
      const chapter = unwrapCommand<EpubChapterReadResult>(
        await runDraftAction("epub_chapter_read", activeDraftId, {
          chapterId: selectedChapterId,
        }),
        "chapter",
      );
      setChapterDraft(chapter);
      setChapterContent(chapter.content);
      setChapterDirty(false);
      if (chapter.contentTruncated) {
        toast.warning(
          t(
            "epubDraft.chapterTruncated",
            "Chapter content was truncated. Saving is disabled for this chapter.",
          ),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveChapter = async () => {
    if (!chapterDraft) {
      toast.error(t("epubDraft.loadChapterFirst", "Load a chapter first"));
      return;
    }
    if (chapterDraft.contentTruncated) {
      toast.error(t("epubDraft.cannotSaveTruncated", "Cannot save truncated chapter content"));
      return;
    }
    if (
      !window.confirm(
        t(
          "epubDraft.saveChapterConfirm",
          "Save this XHTML chapter into the draft? The source EPUB will not be changed.",
        ),
      )
    ) {
      return;
    }
    const result = await runWorkspaceMutation<EpubChapterPatchResult>(
      "epub_chapter_patch",
      "patch",
      {
        chapterId: chapterDraft.id,
        xhtml: chapterContent,
      },
    );
    if (result) {
      setChapterDraft((current) =>
        current ? { ...current, content: chapterContent, contentTruncated: false } : current,
      );
      setChapterDirty(false);
      toast.success(
        result.changed
          ? t("epubDraft.chapterSaved", "Chapter saved")
          : t("epubDraft.chapterUnchanged", "Chapter unchanged"),
      );
    }
  };

  const updateMetadataDraft = (field: keyof EpubMetadataDraft, value: string) => {
    setMetadataDraft((current) => ({ ...current, [field]: value }));
    setMetadataDirty(true);
  };

  const handleSaveMetadata = async () => {
    if (
      !window.confirm(
        t(
          "epubDraft.saveMetadataConfirm",
          "Save metadata changes into the draft? The source EPUB will not be changed.",
        ),
      )
    ) {
      return;
    }
    const result = await runWorkspaceMutation<EpubMetadataPatchResult>(
      "epub_metadata_patch",
      "metadata",
      {
        metadata: metadataDraftToPatch(metadataDraft),
      },
    );
    if (result) {
      setMetadataDraft(metadataToDraft(result.metadata));
      setMetadataDirty(false);
      toast.success(
        result.changed
          ? t("epubDraft.metadataSaved", "Metadata saved")
          : t("epubDraft.metadataUnchanged", "Metadata unchanged"),
      );
    }
  };

  const handleDiscard = async () => {
    if (
      !window.confirm(
        t(
          "epubDraft.discardConfirm",
          "Discard this draft? The source EPUB will not be changed, but the draft can no longer be edited.",
        ),
      )
    ) {
      return;
    }
    const result = await runWorkspaceMutation<EpubDiscardResult>(
      "epub_draft_discard",
      "discarded",
      {
        reason: discardReason,
      },
    );
    if (result) {
      toast.success(t("epubDraft.discarded", "Draft discarded"));
    }
  };

  const handleExportDraft = async () => {
    if (snapshot.validation && !snapshot.validation.valid) {
      toast.error(t("epubDraft.exportBlockedInvalid", "Fix validation errors before export."));
      return;
    }
    if (
      !window.confirm(
        t(
          "epubDraft.exportConfirm",
          "Export this draft as a new EPUB? ReadAny will validate first and will not overwrite the source EPUB.",
        ),
      )
    ) {
      return;
    }

    setActionBusy("epub_export");
    setLastError(null);
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const outputPath = await save({
        defaultPath: defaultExportName(snapshot),
        filters: [{ name: "EPUB", extensions: ["epub"] }],
      });
      if (!outputPath) {
        setActionBusy(null);
        return;
      }
      const safeOutputPath = outputPath.toLowerCase().endsWith(".epub")
        ? outputPath
        : `${outputPath}.epub`;

      const result = unwrapCommand<EpubExportResult>(
        await runDraftAction("epub_export", activeDraftId, { outputPath: safeOutputPath }),
        "export",
      );
      await loadWorkspace(activeDraftId);
      toast.success(
        t("epubDraft.exported", "EPUB exported: {{path}}", {
          path: result.outputPath,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {t("epubDraft.title", "EPUB 精排工作区")}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{activeDraftId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={draftIdInput}
            onChange={(event) => setDraftIdInput(event.target.value)}
            className="h-8 w-72 font-mono text-xs"
            placeholder={t("epubDraft.draftId", "draft id")}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void loadWorkspace(draftIdInput)}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {t("common.refresh", "刷新")}
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
        <section className="min-h-0 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <MetricPanel
              icon={History}
              label={t("epubDraft.history", "History")}
              value={String(snapshot.history?.entries.length ?? "-")}
              detail={snapshot.history?.status ?? t("common.loading", "Loading")}
            />
            <MetricPanel
              icon={FileDiff}
              label={t("epubDraft.diff", "Diff")}
              value={String(snapshot.diff?.changedCount ?? "-")}
              detail={t("epubDraft.changedResources", "changed resources")}
            />
            <MetricPanel
              icon={ShieldCheck}
              label={t("epubDraft.validate", "Validate")}
              value={
                snapshot.validation
                  ? snapshot.validation.valid
                    ? t("epubDraft.valid", "Valid")
                    : t("epubDraft.invalid", "Invalid")
                  : "-"
              }
              detail={
                snapshot.validation
                  ? `${snapshot.validation.errorCount} errors / ${snapshot.validation.warningCount} warnings`
                  : t("common.loading", "Loading")
              }
            />
          </div>

          {lastError ? (
            <div className="mt-4 flex items-start gap-2 whitespace-pre-wrap rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{lastError}</span>
            </div>
          ) : null}

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.controls", "Draft controls")}
              desc={t(
                "epubDraft.controlsDesc",
                "These actions write only to the controlled draft workspace and append history entries.",
              )}
            />
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ListTree className="size-4 text-muted-foreground" />
                  {t("epubDraft.rebuildToc", "Rebuild TOC")}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "epubDraft.rebuildTocDesc",
                    "Regenerate the EPUB3 nav from spine chapters. This does not rewrite source EPUB.",
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  variant="outline"
                  disabled={loading || !!actionBusy || snapshot.history?.status === "discarded"}
                  onClick={() => void handleRebuildToc()}
                >
                  <ListTree className="size-3.5" />
                  {actionBusy === "epub_toc_rebuild"
                    ? t("common.loading", "Loading")
                    : t("epubDraft.rebuild", "Rebuild")}
                </Button>
              </div>

              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <RotateCcw className="size-4 text-muted-foreground" />
                  {t("epubDraft.undo", "Undo")}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "epubDraft.undoDesc",
                    "Undo a recorded chapter, metadata, or toc patch from the operation list.",
                  )}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {t("epubDraft.undoableCount", "{{count}} undoable operations", {
                    count: undoableEntries.length,
                  })}
                </p>
              </div>

              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Trash2 className="size-4 text-muted-foreground" />
                  {t("epubDraft.discard", "Discard")}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "epubDraft.discardDesc",
                    "Mark this draft inactive. Source EPUB and exported files are not touched.",
                  )}
                </p>
                <Textarea
                  value={discardReason}
                  onChange={(event) => setDiscardReason(event.target.value)}
                  placeholder={t("epubDraft.discardReason", "Reason, optional")}
                  className="mt-3 min-h-16 text-xs"
                  disabled={snapshot.history?.status === "discarded"}
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  variant="outline"
                  disabled={loading || !!actionBusy || snapshot.history?.status === "discarded"}
                  onClick={() => void handleDiscard()}
                >
                  <Trash2 className="size-3.5" />
                  {actionBusy === "epub_draft_discard"
                    ? t("common.loading", "Loading")
                    : t("epubDraft.discard", "Discard")}
                </Button>
              </div>

              <div className="rounded-md border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Download className="size-4 text-muted-foreground" />
                  {t("epubDraft.export", "Export")}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "epubDraft.exportDesc",
                    "Validate and write this draft to a new EPUB chosen in the save dialog.",
                  )}
                </p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {snapshot.validation?.valid === false
                    ? t("epubDraft.exportInvalid", "Export is blocked until validation passes.")
                    : t("epubDraft.exportReady", "Source EPUB is not overwritten.")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={
                    loading ||
                    !!actionBusy ||
                    snapshot.history?.status === "discarded" ||
                    snapshot.validation?.valid === false
                  }
                  onClick={() => void handleExportDraft()}
                >
                  <Download className="size-3.5" />
                  {actionBusy === "epub_export"
                    ? t("common.loading", "Loading")
                    : t("epubDraft.export", "Export")}
                </Button>
              </div>
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.chapterEditor", "Chapter editor")}
              desc={t(
                "epubDraft.chapterEditorDesc",
                "Load full XHTML from the draft, edit it, and save back through the controlled CLI bridge.",
              )}
            />
            <div className="mt-3 rounded-md border bg-card p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Select
                  value={selectedChapterId}
                  onValueChange={(value) => {
                    if (chapterDirty && !window.confirm(t("epubDraft.switchChapterConfirm", "Discard unsaved chapter edits?"))) {
                      return;
                    }
                    setSelectedChapterId(value);
                    setChapterDraft(null);
                    setChapterContent("");
                    setChapterDirty(false);
                  }}
                  disabled={!chapterOptions.length || snapshot.history?.status === "discarded"}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={t("epubDraft.selectChapter", "Select chapter")} />
                  </SelectTrigger>
                  <SelectContent>
                    {chapterOptions.map((chapter) => (
                      <SelectItem key={chapter.id} value={chapter.id}>
                        {chapter.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    loading ||
                    !!actionBusy ||
                    !selectedChapterId ||
                    snapshot.history?.status === "discarded"
                  }
                  onClick={() => void handleLoadChapter()}
                >
                  <BookOpen className="size-3.5" />
                  {actionBusy === "epub_chapter_read"
                    ? t("common.loading", "Loading")
                    : t("epubDraft.loadChapter", "Load")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    loading ||
                    !!actionBusy ||
                    !chapterDraft ||
                    !chapterDirty ||
                    chapterDraft.contentTruncated ||
                    snapshot.history?.status === "discarded"
                  }
                  onClick={() => void handleSaveChapter()}
                >
                  <Save className="size-3.5" />
                  {actionBusy === "epub_chapter_patch"
                    ? t("common.saving", "Saving")
                    : t("common.save", "Save")}
                </Button>
              </div>

              {chapterDraft ? (
                <div className="mt-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{chapterDraft.id}</span>
                    <span>{chapterDraft.title ?? chapterDraft.href}</span>
                    {chapterDraft.contentTruncated ? (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                        {t("epubDraft.truncated", "Truncated")}
                      </span>
                    ) : null}
                    {chapterDirty ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800">
                        {t("epubDraft.unsaved", "Unsaved")}
                      </span>
                    ) : null}
                  </div>
                  <Textarea
                    value={chapterContent}
                    onChange={(event) => {
                      setChapterContent(event.target.value);
                      setChapterDirty(true);
                    }}
                    spellCheck={false}
                    className="min-h-[360px] resize-y font-mono text-xs leading-relaxed"
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </div>
              ) : (
                <EmptyPanel
                  text={
                    chapterOptions.length
                      ? t("epubDraft.noChapterLoaded", "Select and load a chapter to edit.")
                      : t("epubDraft.noChapterOptions", "No editable XHTML spine chapters found.")
                  }
                />
              )}
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.metadataEditor", "Metadata editor")}
              desc={t(
                "epubDraft.metadataEditorDesc",
                "Edit OPF metadata in the draft only. Metadata patches share the same history and undo flow.",
              )}
            />
            <div className="mt-3 rounded-md border bg-card p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <FieldLabel label={t("epubDraft.metadataTitle", "Title")}>
                  <Input
                    value={metadataDraft.title}
                    onChange={(event) => updateMetadataDraft("title", event.target.value)}
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
                <FieldLabel label={t("epubDraft.metadataCreator", "Creator")}>
                  <Input
                    value={metadataDraft.creator}
                    onChange={(event) => updateMetadataDraft("creator", event.target.value)}
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
                <FieldLabel label={t("epubDraft.metadataLanguage", "Language")}>
                  <Input
                    value={metadataDraft.language}
                    onChange={(event) => updateMetadataDraft("language", event.target.value)}
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
                <FieldLabel label={t("epubDraft.metadataPublisher", "Publisher")}>
                  <Input
                    value={metadataDraft.publisher}
                    onChange={(event) => updateMetadataDraft("publisher", event.target.value)}
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <FieldLabel label={t("epubDraft.metadataDescription", "Description")}>
                  <Textarea
                    value={metadataDraft.description}
                    onChange={(event) => updateMetadataDraft("description", event.target.value)}
                    className="min-h-24 text-xs"
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
                <FieldLabel label={t("epubDraft.metadataSubjects", "Subjects")}>
                  <Textarea
                    value={metadataDraft.subjects}
                    onChange={(event) => updateMetadataDraft("subjects", event.target.value)}
                    placeholder={t("epubDraft.subjectsPlaceholder", "One per line or comma separated")}
                    className="min-h-24 text-xs"
                    disabled={snapshot.history?.status === "discarded"}
                  />
                </FieldLabel>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {metadataDirty
                    ? t("epubDraft.metadataUnsaved", "Metadata has unsaved changes.")
                    : t("epubDraft.metadataSynced", "Metadata matches the loaded draft snapshot.")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    loading ||
                    !!actionBusy ||
                    !metadataDirty ||
                    snapshot.history?.status === "discarded"
                  }
                  onClick={() => void handleSaveMetadata()}
                >
                  <Save className="size-3.5" />
                  {actionBusy === "epub_metadata_patch"
                    ? t("common.saving", "Saving")
                    : t("common.save", "Save")}
                </Button>
              </div>
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.changedFiles", "Changed files")}
              desc={t(
                "epubDraft.changedFilesDesc",
                "Entry-level diff keeps source paths hidden and does not expose full book content.",
              )}
            />
            <div className="mt-3 overflow-hidden rounded-md border">
              {changedEntries.length === 0 ? (
                <EmptyPanel text={t("epubDraft.noChanges", "No changed resources yet.")} />
              ) : (
                <div className="divide-y">
                  {changedEntries.map((entry) => (
                    <div key={entry.path} className="grid grid-cols-[96px_minmax(0,1fr)_120px] gap-3 px-3 py-2 text-xs">
                      <span
                        className={cn(
                          "w-fit rounded px-1.5 py-0.5 font-medium",
                          entry.status === "modified" && "bg-amber-100 text-amber-800",
                          entry.status === "added" && "bg-emerald-100 text-emerald-800",
                          entry.status === "removed" && "bg-red-100 text-red-800",
                        )}
                      >
                        {entry.status}
                      </span>
                      <span className="truncate font-mono text-foreground">{entry.path}</span>
                      <span className="text-right text-muted-foreground">
                        {entry.draftSize ?? entry.sourceSize ?? 0} B
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle
              title={t("epubDraft.validationIssues", "Validation issues")}
              desc={t("epubDraft.validationIssuesDesc", "Validate runs with publisher profile and does not modify files.")}
            />
            <div className="mt-3 overflow-hidden rounded-md border">
              {!snapshot.validation || snapshot.validation.issues.length === 0 ? (
                <EmptyPanel text={t("epubDraft.noIssues", "No validation issues.")} />
              ) : (
                <div className="divide-y">
                  {snapshot.validation.issues.map((issue, index) => (
                    <div key={`${issue.code}-${index}`} className="px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 font-medium",
                            issue.severity === "error"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800",
                          )}
                        >
                          {issue.severity}
                        </span>
                        <span className="font-mono text-muted-foreground">{issue.code}</span>
                      </div>
                      <p className="mt-1 text-foreground">{issue.message}</p>
                      {issue.path ? <p className="mt-1 truncate font-mono text-muted-foreground">{issue.path}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="min-h-0 overflow-y-auto border-l bg-muted/20 p-4">
          <SectionTitle
            title={t("epubDraft.operations", "Operations")}
            desc={t("epubDraft.operationsDesc", "AI and user edits share this draft history.")}
          />
          <div className="mt-3 space-y-2">
            {snapshot.history?.entries.length ? (
              snapshot.history.entries.map((entry) => (
                <div key={entry.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                      <span className="truncate text-xs font-medium text-foreground">
                        {entry.action}
                      </span>
                    </div>
                    {undoableEntries.some((item) => item.id === entry.id) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={loading || !!actionBusy || snapshot.history?.status === "discarded"}
                        onClick={() => void handleUndo(entry.id)}
                      >
                        <RotateCcw className="size-3" />
                        {t("epubDraft.undo", "Undo")}
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDateTime(entry.timestamp, i18n.language)}
                  </p>
                  <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
                    {entry.chapterId ?? entry.href ?? entry.fields?.join(", ") ?? entry.operationId ?? entry.id}
                  </p>
                </div>
              ))
            ) : (
              <EmptyPanel text={t("epubDraft.noHistory", "No history loaded yet.")} />
            )}
          </div>

          <details className="mt-4 rounded-md border bg-background p-3">
            <summary className="cursor-pointer text-xs font-medium text-foreground">
              {t("epubDraft.rawJson", "Raw JSON")}
            </summary>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
              {JSON.stringify(snapshot.raw, null, 2)}
            </pre>
          </details>
        </aside>
      </main>
    </div>
  );
}

function MetricPanel({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ElementType;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{text}</div>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}
