import { routePath, routes, type Route } from "./routes.ts";

/** Adds the trailing slash that GitHub Pages would redirect to. */
export function normalizePath(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** The route at `pathname` under `base`, or undefined for a page not found. */
export function matchRoute(pathname: string, base: string): Route | undefined {
  const path = normalizePath(pathname);
  if (!path.startsWith(base)) return undefined;
  const local = `/${path.slice(base.length)}`;
  return routes.find((r) => routePath(r.slug) === local);
}
