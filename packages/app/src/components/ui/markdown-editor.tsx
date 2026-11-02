import { cn } from "@readany/core/utils";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";
/**
 * MarkdownEditor — Refined WYSIWYG markdown editor
 * Editorial design with elegant toolbar and rich formatting support
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = false,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  // Track internal updates to prevent sync loop
  const isInternalUpdate = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        dropcursor: false,
        gapcursor: false,
      }),
      Markdown.configure({
        markedOptions: {
          gfm: true,
          breaks: true,
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || "",
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: value,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-[80px] outline-none",
          "prose-headings:font-semibold prose-headings:tracking-tight",
          "prose-h1:text-lg prose-h1:mb-2 prose-h1:mt-3",
          "prose-h2:text-base prose-h2:mb-1.5 prose-h2:mt-2.5",
          "prose-h3:text-sm prose-h3:mb-1 prose-h3:mt-2",
          "prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-[13px]",
          "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-li:text-[13px]",
          "prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/30 prose-blockquote:py-0.5 prose-blockquote:px-3 prose-blockquote:rounded-r prose-blockquote:not-italic prose-blockquote:text-muted-foreground",
          "prose-code:px-1.5 prose-code:py-0.5 prose-code:bg-muted prose-code:rounded prose-code:text-[12px] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
          "prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-md prose-pre:text-[12px]",
          "prose-hr:border-border prose-hr:my-3",
          "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
          "prose-strong:font-semibold prose-strong:text-foreground",
          "prose-em:text-foreground/90",
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = editor.getMarkdown();
      isInternalUpdate.current = true;
      onChange(markdown);
    },
    immediatelyRender: false,
  });

  // Sync external value changes only (not internal updates)
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentMarkdown = editor.getMarkdown();
      // Only update if content is genuinely different (normalize comparison)
      if (value?.trim() !== currentMarkdown?.trim()) {
        editor.commands.setContent(value || "", { contentType: "markdown" });
      }
    }
    // Reset the flag after effect
    isInternalUpdate.current = false;
  }, [editor, value]);

  // Auto focus
  useEffect(() => {
    if (editor && autoFocus) {
      editor.commands.focus();
    }
  }, [editor, autoFocus]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt(t("editor.enterLink"), previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        "group rounded-lg border border-border/60 bg-background overflow-hidden",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 focus-within:ring-offset-1",
        "transition-all duration-200",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/40 bg-muted/20 px-2 py-1.5">
        {/* History */}
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title={t("editor.undo")}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title={t("editor.redo")}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Headings */}
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive("heading", { level: 1 })}
            title={t("editor.heading1")}
          >
            <Heading1 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive("heading", { level: 2 })}
            title={t("editor.heading2")}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive("heading", { level: 3 })}
            title={t("editor.heading3")}
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Text formatting */}
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive("bold")}
            title={t("editor.bold")}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive("italic")}
            title={t("editor.italic")}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive("strike")}
            title={t("editor.strikethrough")}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive("code")}
            title={t("editor.inlineCode")}
          >
            <Code className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={setLink}
            isActive={editor.isActive("link")}
            title={t("editor.link")}
          >
            <Link2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Blocks */}
        <ToolbarGroup>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive("bulletList")}
            title={t("editor.bulletList")}
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive("orderedList")}
            title={t("editor.orderedList")}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive("blockquote")}
            title={t("editor.blockquote")}
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title={t("editor.horizontalRule")}
          >
            <Minus className="h-3.5 w-3.5" />
          </ToolbarButton>
        </ToolbarGroup>
      </div>

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className={cn(
          "max-h-[30vh] overflow-y-auto px-4 py-3",
          "[&_.ProseMirror]:outline-none",
          "[&_.is-editor-empty:first-child::before]:text-muted-foreground/60",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0",
          "[&_.is-editor-empty:first-child::before]:text-[13px]",
        )}
      />
    </div>
  );
}

/* --- Toolbar Components --- */

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center rounded p-1 transition-all duration-150",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        isActive
          ? "bg-primary/12 text-primary shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground active:scale-95",
      )}
    >
      {children}
    </button>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px bg-border/60" />;
}
