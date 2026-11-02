/**
 * Tool type definitions for AI agent system.
 * The actual tool implementations (which depend on db/rag) live in the app package.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  timeoutMs?: number;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
}
