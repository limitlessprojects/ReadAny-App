/**
 * Tauri plugin-dialog shim — active only when READANY_WEB=1 (vite alias).
 *
 * `open()` spawns a real browser file picker, stashes picked files into the
 * WebVFS under /imports/, and returns VFS paths — the exact contract the
 * Tauri dialog has (path strings that the caller then reads via plugin-fs).
 *
 * The <input type="file"> stays in the DOM (hidden) so browser automation
 * can drive imports for demos and tests.
 */

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface DialogOpenOptions {
  multiple?: boolean;
  filters?: DialogFilter[];
  directory?: boolean;
  title?: string;
}

const IMPORT_DIR = "/imports";

function sanitizeName(name: string): string {
  return name.replace(/[/\\]/g, "_") || "import.bin";
}

async function stash(files: File[]): Promise<string[]> {
  const { vfsExists, vfsMkdir, vfsWriteFile } = await import("./web-vfs");
  await vfsMkdir(IMPORT_DIR);
  const paths: string[] = [];
  for (const file of files) {
    const safeName = sanitizeName(file.name);
    let candidate = `${IMPORT_DIR}/${safeName}`;
    let n = 2;
    while (await vfsExists(candidate)) {
      const dot = safeName.lastIndexOf(".");
      const stem = dot > 0 ? safeName.slice(0, dot) : safeName;
      const ext = dot > 0 ? safeName.slice(dot) : "";
      candidate = `${IMPORT_DIR}/${stem}-${n}${ext}`;
      n += 1;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await vfsWriteFile(candidate, bytes);
    paths.push(candidate);
  }
  return paths;
}

/** Shared seam for drag-and-drop importers: the HTML5 drop event only hands
 *  out File objects (no Tauri `path`), so web callers persist them into the
 *  WebVFS import dir themselves and treat the returned paths like dialog
 *  results. Desktop callers never need this (their files carry paths). */
export function stashWebFiles(files: File[]): Promise<string[]> {
  return stash(files);
}

let lastPickerInput: HTMLInputElement | null = null;

export function getLastPickerInput(): HTMLInputElement | null {
  return lastPickerInput;
}

/**
 * Automation seam: when a dialog is pending, resolves it with the given File
 * objects (stashed into the WebVFS exactly like a real pick). lets demo
 * scripts and tests drive imports deterministically in headless browsers,
 * where Chromium auto-cancels programmatic file choosers.
 */
declare global {
  interface Window {
    __readanyResolveFiles?: (files: File[]) => Promise<string[] | null>;
  }
}

type PendingDialog = {
  resolve: (value: string | string[] | null) => void;
  multiple: boolean;
};

let pendingDialog: PendingDialog | null = null;

if (typeof window !== "undefined") {
  window.__readanyResolveFiles = async (files: File[]) => {
    if (!pendingDialog) return null;
    const dialog = pendingDialog;
    pendingDialog = null;
    if (!files || files.length === 0) {
      dialog.resolve(null);
      return null;
    }
    const paths = await stash(files);
    dialog.resolve(dialog.multiple ? paths : (paths[0] ?? null));
    return paths;
  };
}

export function open(options?: DialogOpenOptions): Promise<string | string[] | null> {
  const multiple = options?.multiple ?? false;

  if (options?.directory) {
    // Directory picking is not part of the web demo surface.
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "readany-web-dialog-input";
    // Visible to automation, invisible to the user.
    input.style.position = "fixed";
    input.style.left = "0";
    input.style.top = "0";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    input.setAttribute("data-testid", "web-dialog-file-input");
    if (multiple) input.multiple = true;
    const extensions = options?.filters?.flatMap((f) => f.extensions ?? []) ?? [];
    if (extensions.length > 0) {
      input.accept = extensions
        .map((e) => (e.startsWith(".") ? e : `.${e.toLowerCase()}`))
        .join(",");
    }

    let settled = false;
    const cleanup = () => {
      input.remove();
      if (lastPickerInput === input) lastPickerInput = null;
      if (pendingDialog && pendingDialog.resolve === resolveWithCleanup) pendingDialog = null;
    };

    const resolveWithCleanup = (value: string | string[] | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    input.addEventListener("change", async () => {
      if (settled) return;
      settled = true;
      const files = Array.from(input.files ?? []);
      cleanup();
      if (files.length === 0) {
        resolve(null);
        return;
      }
      const paths = await stash(files);
      resolve(multiple ? paths : (paths[0] ?? null));
    });

    // Cancel: Tauri resolves null when the dialog is dismissed.
    input.addEventListener("cancel", () => {
      resolveWithCleanup(null);
    });

    pendingDialog = { resolve: resolveWithCleanup, multiple };
    lastPickerInput = input;
    document.body.appendChild(input);
    // Under browser automation (navigator.webdriver) Chromium auto-cancels
    // programmatic file choosers immediately — skip the native click and let
    // the __readanyResolveFiles seam resolve the dialog instead.
    if (navigator.webdriver === true) {
      console.log("[DialogShim] automation mode — awaiting __readanyResolveFiles");
      return;
    }
    input.click();
  });
}

export function save(_options?: unknown): Promise<string | null> {
  // Save dialogs are not part of the web demo surface.
  return Promise.resolve(null);
}

export function message(_options?: unknown): Promise<void> {
  return Promise.resolve();
}

export function ask(_options?: unknown): Promise<boolean> {
  return Promise.resolve(window.confirm(String(_options ?? "")));
}

export function confirm(_options?: unknown): Promise<boolean> {
  return Promise.resolve(window.confirm(String(_options ?? "")));
}
