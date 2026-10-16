import { Suspense, useEffect, useRef } from "react";
import { KitchenSink, NotFound, OgCards, pages } from "./pages.ts";
import { pageTitle, routePath, routes } from "./routes.ts";
import {
  Link,
  localPath,
  matchRoute,
  navigate,
  normalizePath,
  useLocation,
} from "./router.ts";
import { ThemeToggle } from "./viz/ui/ThemeToggle.tsx";

const base = import.meta.env.BASE_URL;
const chapters = routes.slice(1, 5);
const more = routes.slice(5);

export function App() {
  const location = useLocation();
  const [pathname = "/", hash = ""] = location.split(/(?=#)/);
  const route = matchRoute(pathname, base);
  const local = localPath(pathname, base);
  // Pages outside the routes, each in its own build only.
  const extra = route
    ? null
    : local === "/kitchen-sink/" && KitchenSink
      ? { Page: KitchenSink, title: "Kitchen sink – serving-explained" }
      : local === "/og-cards/" && OgCards
        ? { Page: OgCards, title: "Preview cards – serving-explained" }
        : null;
  const isExtra = extra !== null;
  const Page = route ? pages[route.slug] : (extra?.Page ?? NotFound);
  const title = route
    ? pageTitle(route)
    : (extra?.title ?? "Page not found – serving-explained");

  useEffect(() => {
    if ((route || isExtra) && !pathname.endsWith("/")) {
      navigate(normalizePath(pathname) + window.location.search + hash, true);
    }
  }, [route, isExtra, pathname, hash]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link to="/" className="site-header__brand">
          serving-explained
        </Link>
        <nav className="site-nav" aria-label="Chapters">
          <ol>
            {chapters.map((r, i) => (
              <li key={r.slug}>
                <Link
                  to={routePath(r.slug)}
                  aria-current={
                    local === routePath(r.slug) ? "page" : undefined
                  }
                >
                  <span className="site-nav__num" aria-hidden="true">
                    0{i + 1}
                  </span>
                  {r.title.replace(/^The /, "")}
                </Link>
              </li>
            ))}
            {more.map((r) => (
              <li key={r.slug}>
                <Link
                  to={routePath(r.slug)}
                  aria-current={
                    local === routePath(r.slug) ? "page" : undefined
                  }
                >
                  {r.title}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
        <div className="site-header__theme">
          <ThemeToggle />
        </div>
      </header>
      <main id="main">
        <Suspense fallback={null}>
          <Page />
          <OnNavigate path={pathname} hash={hash} title={title} />
        </Suspense>
      </main>
    </>
  );
}

/**
 * Runs once the page has rendered: sets the title, scrolls to the hash or the
 * top, and moves focus to the h1. The first load keeps the browser's focus.
 */
function OnNavigate({
  path,
  hash,
  title,
}: {
  path: string;
  hash: string;
  title: string;
}) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    document.title = title;
    const navigated = previous.current !== null && previous.current !== path;
    previous.current = path;
    const target = hash
      ? document.getElementById(decodeURIComponent(hash.slice(1)))
      : null;
    if (target) target.scrollIntoView();
    else if (navigated) window.scrollTo(0, 0);
    if (navigated) {
      const h1 = document.querySelector("h1");
      h1?.setAttribute("tabindex", "-1");
      h1?.focus({ preventScroll: true });
    }
  }, [path, hash, title]);
  return null;
}
