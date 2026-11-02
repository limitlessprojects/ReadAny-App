export type CommandResult<T = unknown> =
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

export function success<T>(data: T, warnings?: string[]): CommandResult<T> {
  return warnings?.length ? { ok: true, data, warnings } : { ok: true, data };
}

export function failure(
  code: string,
  message: string,
  details?: unknown,
): CommandResult<never> {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
