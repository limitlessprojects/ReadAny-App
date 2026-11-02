/**
 * Resolve a public/ asset against the deployed base path ("/app/" on the web
 * build, "/" on desktop). Vite rewrites asset URLs only inside index.html —
 * JSX <img src="/x.svg"> strings pass through untouched, so they 404 once the
 * SPA is served under /app/. Always route public assets through this helper.
 */
export function publicAsset(path: string): string {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}
