/**
 * Lightweight library change event — allows core tools to notify
 * platform-specific stores that books/tags have been mutated.
 */
type Listener = (deletedTags?: string[]) => void;

const listeners = new Set<Listener>();

/** Subscribe to library change events. Returns an unsubscribe function. */
export function onLibraryChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Emit a library change event (called from tool execute functions). */
export function emitLibraryChanged(deletedTags?: string[]): void {
  for (const fn of listeners) {
    try {
      fn(deletedTags);
    } catch (err) {
      console.warn("[Library] Listener error in emitLibraryChanged:", err);
    }
  }
}
