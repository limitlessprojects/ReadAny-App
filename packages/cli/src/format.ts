import type { CommandResult } from "./result.js";

export function formatJson(result: CommandResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

export function formatText(result: CommandResult): string {
  if (!result.ok) {
    return `Error: ${result.error.message}\n`;
  }

  const data = result.data;
  if (typeof data === "string") return `${data}\n`;
  return `${JSON.stringify(data, null, 2)}\n`;
}
