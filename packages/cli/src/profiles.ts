export type PermissionScope =
  | "book.read"
  | "book.import"
  | "book.metadata.write"
  | "content.read"
  | "note.read"
  | "note.write"
  | "knowledge.read"
  | "knowledge.write"
  | "rag.search"
  | "epub.inspect"
  | "epub.draft"
  | "epub.export"
  | "stats.read"
  | "sync.status"
  | "sync.run"
  | "admin.backup";

export type AccessProfile = "readonly" | "assistant" | "editor" | "publisher" | "admin";

export const DEFAULT_PROFILE: AccessProfile = "readonly";

const readonlyScopes = [
  "book.read",
  "content.read",
  "note.read",
  "knowledge.read",
  "rag.search",
  "stats.read",
] satisfies PermissionScope[];

const assistantScopes = [
  ...readonlyScopes,
  "note.write",
  "knowledge.write",
] satisfies PermissionScope[];

const editorScopes = [
  ...assistantScopes,
  "epub.inspect",
  "epub.draft",
  "book.metadata.write",
] satisfies PermissionScope[];

const publisherScopes = [...editorScopes, "epub.export"] satisfies PermissionScope[];

const adminScopes = [
  ...publisherScopes,
  "book.import",
  "sync.status",
  "sync.run",
  "admin.backup",
] satisfies PermissionScope[];

export const PROFILE_SCOPES: Record<AccessProfile, readonly PermissionScope[]> = {
  readonly: readonlyScopes,
  assistant: assistantScopes,
  editor: editorScopes,
  publisher: publisherScopes,
  admin: adminScopes,
};

export function isAccessProfile(value: string): value is AccessProfile {
  return value in PROFILE_SCOPES;
}

export function parseAccessProfile(value: string | undefined): AccessProfile {
  if (!value) return DEFAULT_PROFILE;
  if (isAccessProfile(value)) return value;
  throw new Error(`Unknown ReadAny access profile: ${value}`);
}

export function profileHasScope(profile: AccessProfile, scope: PermissionScope): boolean {
  return PROFILE_SCOPES[profile].includes(scope);
}

const PROFILE_ORDER = [
  "readonly",
  "assistant",
  "editor",
  "publisher",
  "admin",
] satisfies AccessProfile[];

export function getMinimumProfileForScopes(scopes: readonly PermissionScope[]): AccessProfile {
  for (const profile of PROFILE_ORDER) {
    if (scopes.every((scope) => profileHasScope(profile, scope))) {
      return profile;
    }
  }
  return "admin";
}
