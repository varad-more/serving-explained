import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Slug } from "./routes.ts";

type Page = LazyExoticComponent<ComponentType>;

/** One lazily loaded chunk per route. */
export const pages: Record<Slug, Page> = {
  "": lazy(() => import("./pages/Landing.tsx")),
  "kv-cache": lazy(() => import("./chapters/kv-cache/index.mdx")),
  "paged-attention": lazy(() => import("./chapters/paged-attention/index.mdx")),
  "continuous-batching": lazy(
    () => import("./chapters/continuous-batching/index.mdx"),
  ),
  "prefix-caching": lazy(() => import("./chapters/prefix-caching/index.mdx")),
  sandbox: lazy(() => import("./pages/Sandbox.tsx")),
  glossary: lazy(() => import("./pages/Glossary.tsx")),
};

export const NotFound: Page = lazy(() => import("./pages/NotFound.tsx"));
