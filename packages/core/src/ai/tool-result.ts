export interface ToolErrorResult {
  error: string;
}

function readStringField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.trim() ? field : null;
}

export function getToolResultError(result: unknown): string | null {
  if (!result) return null;

  const directError = readStringField(result, "error");
  if (directError) return directError;

  if (typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (record.success === false) {
      return (
        readStringField(result, "message") ||
        readStringField(result, "reason") ||
        "Tool execution failed"
      );
    }
  }

  if (typeof result !== "string") return null;

  try {
    const parsed = JSON.parse(result);
    return getToolResultError(parsed);
  } catch {
    return null;
  }
}

export function isToolErrorResult(result: unknown): result is ToolErrorResult {
  return getToolResultError(result) !== null;
}
