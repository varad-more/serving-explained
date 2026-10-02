import {
  createElement,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";
import { routePath, routes, type AppRoute } from "./routes.ts";

/** Adds the trailing slash that GitHub Pages would redirect to. */
export function normalizePath(pathname: string): string {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

/** The route at `pathname` under `base`, or undefined for a page not found. */
export function matchRoute(
  pathname: string,
  base: string,
): AppRoute | undefined {
  const path = normalizePath(pathname);
  if (!path.startsWith(base)) return undefined;
  const local = `/${path.slice(base.length)}`;
  return routes.find((r) => routePath(r.slug) === local);
}

/** A path below the site base ("/kv-cache/#step-2") as an href. */
export function href(to: string, base = import.meta.env.BASE_URL): string {
  return base + to.replace(/^\//, "");
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
  };
}

function snapshot(): string {
  return window.location.pathname + window.location.hash;
}

/** The current pathname plus hash, re-rendering on every navigation. */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, snapshot);
}

export function navigate(url: string, replace = false): void {
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

/** An internal link. Plain left clicks navigate without a page load. */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const url = href(to);
  return createElement("a", {
    ...rest,
    href: url,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      const modified = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
      if (e.defaultPrevented || e.button !== 0 || modified) return;
      e.preventDefault();
      navigate(url);
    },
  });
}
