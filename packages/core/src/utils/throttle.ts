/**
 * Throttle utility — limits function execution to at most once per `interval` ms.
 * Supports emitLast option to ensure the final call is always executed with the latest args.
 */
// biome-ignore lint: generic function signature needs any for flexibility
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number,
  options?: { emitLast?: boolean },
): (...args: Parameters<T>) => void {
  let lastTime = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  const emitLast = options?.emitLast ?? true;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = interval - (now - lastTime);

    // Always save the latest args
    lastArgs = args;

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastTime = now;
      lastArgs = null;
      fn(...args);
    } else if (emitLast && !timer) {
      timer = setTimeout(() => {
        lastTime = Date.now();
        timer = null;
        // Use the latest args saved during the throttle period
        if (lastArgs) {
          const argsToUse = lastArgs;
          lastArgs = null;
          fn(...argsToUse);
        }
      }, remaining);
    }
  };
}
