/**
 * Chat export utilities — shared between web (app) and mobile (app-expo).
 * Supports Markdown, JSON, and plain-text clipboard export.
 */
import type { MessageV2, Part } from "../types/message";

/** Options for export functions */
export interface ChatExportOptions {
  /** Thread title used as document heading */
  title?: string;
  /** Include reasoning/thinking parts (default: true) */
  includeReasoning?: boolean;
  /** Include tool call parts (default: false) */
  includeToolCalls?: boolean;
  /** Include citation parts (default: true) */
  includeCitations?: boolean;
  /** Include aborted parts (default: false) */
  includeAborted?: boolean;
  /** User role label (default: "You") */
  userLabel?: string;
  /** AI role label (default: "AI") */
  aiLabel?: string;
}

const DEFAULT_OPTIONS: Required<ChatExportOptions> = {
  title: "",
  includeReasoning: false,
  includeToolCalls: false,
  includeCitations: true,
  includeAborted: false,
  userLabel: "You",
  aiLabel: "AI",
};

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

function formatPartMarkdown(part: Part, opts: Required<ChatExportOptions>): string {
  switch (part.type) {
    case "text":
      return part.text.trim();

    case "quote":
      return part.source ? `> ${part.text.trim()}\n> — ${part.source}` : `> ${part.text.trim()}`;

    case "reasoning":
      if (!opts.includeReasoning) return "";
      return `<details>\n<summary>Thinking</summary>\n\n${part.text.trim()}\n\n</details>`;

    case "tool_call": {
      if (!opts.includeToolCalls) return "";
      const args = part.args ? JSON.stringify(part.args, null, 2) : "{}";
      const result = part.result
        ? typeof part.result === "string"
          ? part.result
          : JSON.stringify(part.result, null, 2)
        : "";
      let block = `**Tool: ${part.name}**\n\`\`\`json\n${args}\n\`\`\``;
      if (result) block += `\n\nResult:\n\`\`\`\n${result}\n\`\`\``;
      return block;
    }

    case "citation": {
      if (!opts.includeCitations) return "";
      const label = part.citationIndex ? `[${part.citationIndex}]` : "";
      return `> ${label} ${part.text.trim()}${part.chapterTitle ? `  \n> — ${part.chapterTitle}` : ""}`;
    }

    case "mindmap":
      return `### ${part.title || "Mindmap"}\n\n${part.markdown}`;

    case "mermaid":
      return `### ${part.title || "Diagram"}\n\n\`\`\`mermaid\n${part.chart}\n\`\`\``;

    case "aborted":
      if (!opts.includeAborted) return "";
      return `*[Generation aborted: ${part.reason}]*`;

    default:
      return "";
  }
}

function formatMessageMarkdown(msg: MessageV2, opts: Required<ChatExportOptions>): string {
  const roleLabel = msg.role === "user" ? `**${opts.userLabel}**` : `**${opts.aiLabel}**`;
  const parts = msg.parts.map((p) => formatPartMarkdown(p, opts)).filter((s) => s.length > 0);
  if (parts.length === 0) return "";
  return `${roleLabel}\n\n${parts.join("\n\n")}`;
}

/**
 * Export conversation as a Markdown string.
 */
export function exportChatAsMarkdown(messages: MessageV2[], options?: ChatExportOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const body = messages
    .map((m) => formatMessageMarkdown(m, opts))
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");

  const parts: string[] = [];
  if (opts.title) parts.push(`# ${opts.title}\n`);
  parts.push(body);
  parts.push(
    `\n\n---\n*${opts.title ? opts.title + " — " : ""}Exported ${new Date().toLocaleString()}*`,
  );
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// JSON export
// ---------------------------------------------------------------------------

/**
 * Export conversation as a pretty-printed JSON string.
 */
export function exportChatAsJSON(messages: MessageV2[], options?: ChatExportOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const filtered = messages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts
      .filter((p) => {
        if (p.type === "aborted" && !opts.includeAborted) return false;
        if (p.type === "reasoning" && !opts.includeReasoning) return false;
        if (p.type === "tool_call" && !opts.includeToolCalls) return false;
        if (p.type === "citation" && !opts.includeCitations) return false;
        return true;
      })
      .map((p) => {
        if (p.type === "text") return { type: "text", text: p.text };
        if (p.type === "quote") return { type: "quote", text: p.text, source: p.source };
        if (p.type === "reasoning") return { type: "reasoning", text: p.text };
        if (p.type === "tool_call")
          return { type: "tool_call", name: p.name, args: p.args, result: p.result };
        if (p.type === "citation")
          return {
            type: "citation",
            bookId: p.bookId,
            chapterTitle: p.chapterTitle,
            cfi: p.cfi,
            text: p.text,
          };
        if (p.type === "mindmap") return { type: "mindmap", title: p.title, markdown: p.markdown };
        if (p.type === "mermaid") return { type: "mermaid", title: p.title, chart: p.chart };
        return { type: p.type };
      }),
    createdAt: m.createdAt,
  }));

  return JSON.stringify(
    { title: opts.title || undefined, exportedAt: new Date().toISOString(), messages: filtered },
    null,
    2,
  );
}

// ---------------------------------------------------------------------------
// Plain-text (clipboard) export
// ---------------------------------------------------------------------------

function extractPartText(part: Part): string {
  switch (part.type) {
    case "text":
      return part.text.trim();
    case "quote":
      return `> ${part.text.trim()}`;
    case "reasoning":
      return part.text.trim();
    case "tool_call": {
      const args = part.args ? JSON.stringify(part.args) : "{}";
      return `[Tool: ${part.name}] ${args}`;
    }
    case "citation":
      return `[Citation] ${part.text.trim()}`;
    case "mindmap":
      return part.markdown.trim();
    case "mermaid":
      return part.chart.trim();
    default:
      return "";
  }
}

/**
 * Format messages as plain text suitable for clipboard copy.
 */
export function formatChatForClipboard(messages: MessageV2[], options?: ChatExportOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  return messages
    .map((m) => {
      const role = m.role === "user" ? opts.userLabel : opts.aiLabel;
      const text = m.parts
        .filter((p) => {
          if (p.type === "tool_call" && !opts.includeToolCalls) return false;
          if (p.type === "aborted" && !opts.includeAborted) return false;
          return true;
        })
        .map((p) => extractPartText(p))
        .filter((s) => s.length > 0)
        .join("\n\n");
      return `${role}:\n${text}`;
    })
    .filter((s) => s.trim().length > 0)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Filename helpers
// ---------------------------------------------------------------------------

/**
 * Generate a safe filename for the export file.
 */
export function getExportFilename(ext: "md" | "json" | "txt", prefix = "chat"): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${ext}`;
}
