import type { Part, ToolCallPart } from "../types/message";
import { getToolResultError } from "./tool-result";

export function toolCallPartToMessageToolCall(part: ToolCallPart) {
  return {
    id: part.id,
    name: part.name,
    args: part.args,
    result: part.result,
    status: part.status,
    error: part.error,
    notice: part.notice,
  };
}

export function applyToolResultToParts(
  parts: Part[],
  name: string,
  result: unknown,
  now = Date.now(),
): ToolCallPart | null {
  const part = [...parts]
    .reverse()
    .find(
      (p) =>
        p.type === "tool_call" &&
        (p as ToolCallPart).name === name &&
        (p as ToolCallPart).result === undefined,
    ) as ToolCallPart | undefined;

  if (!part) return null;

  part.result = result;
  const notice =
    result && typeof result === "object"
      ? ((result as Record<string, unknown>).attemptLimitReached
          ? (result as Record<string, unknown>).notice
          : undefined)
      : undefined;
  if (typeof notice === "string" && notice.trim()) {
    part.status = "completed";
    part.error = undefined;
    part.notice = notice;
    part.updatedAt = now;
    return part;
  }

  const toolError = getToolResultError(result);
  if (toolError) {
    part.status = "error";
    part.error = toolError;
    part.notice = undefined;
  } else {
    part.status = "completed";
    part.error = undefined;
    part.notice = undefined;
  }
  part.updatedAt = now;

  return part;
}

export function markRunningToolCallPartsAsError(
  parts: Part[],
  errorMessage: string,
  now = Date.now(),
) {
  for (const part of parts) {
    if (part.type !== "tool_call" || part.status !== "running") continue;
    part.status = "error";
    (part as ToolCallPart).error = errorMessage;
    part.updatedAt = now;
  }
}
