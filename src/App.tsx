import { Suspense, useEffect, useRef } from "react";
import { NotFound, pages } from "./pages.ts";
import { pageTitle } from "./routes.ts";
import {
  Link,
  matchRoute,
  navigate,
  normalizePath,
  useLocation,
} from "./router.ts";

export function App() {
  const location = useLocation();
  const [pathname = "/", hash = ""] = location.split(/(?=#)/);
  const route = matchRoute(pathname, import.meta.env.BASE_URL);
  const Page = route ? pages[route.slug] : NotFound;

  useEffect(() => {
    if (route && !pathname.endsWith("/")) {
      navigate(normalizePath(pathname) + window.location.search + hash, true);
    }
  }, [route, pathname, hash]);

  return (
    <>
      <header>
        <Link to="/">serving-explained</Link>
      </header>
      <Suspense fallback={null}>
        <Page />
        <OnNavigate
          path={pathname}
          hash={hash}
          title={
            route ? pageTitle(route) : "Page not found – serving-explained"
          }
        />
      </Suspense>
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
