/**
 * Route metadata only. It has no imports, so the Node scripts (postbuild and
 * gen-og) can import it directly. The page components live in src/pages.ts.
 */
export interface Route {
  /** The path segment, without slashes. "" is the landing page. */
  slug: string;
  title: string;
  description: string;
  /** The preview image, relative to the site URL. */
  ogImage: string;
}

export const routes = [
  {
    slug: "",
    title: "serving-explained",
    description:
      "Interactive explainers of how LLM servers manage GPU memory and schedule requests, run on a small simulated engine in your browser.",
    ogImage: "og/index.png",
  },
  {
    slug: "kv-cache",
    title: "The KV cache",
    description:
      "What the KV cache stores, how to estimate its size, and why it limits how many requests fit on a GPU.",
    ogImage: "og/kv-cache.png",
  },
  {
    slug: "paged-attention",
    title: "Paged attention",
    description:
      "How fixed-size blocks and a block table cut the memory wasted by reserving space for each request.",
    ogImage: "og/paged-attention.png",
  },
  {
    slug: "continuous-batching",
    title: "Continuous batching",
    description:
      "How scheduling requests at every step changes waiting time, token latency, and throughput.",
    ogImage: "og/continuous-batching.png",
  },
  {
    slug: "prefix-caching",
    title: "Prefix caching",
    description:
      "How requests that share a prompt prefix reuse cached KV blocks, and when they cannot.",
    ogImage: "og/prefix-caching.png",
  },
  {
    slug: "sandbox",
    title: "Sandbox",
    description:
      "Combine all four mechanisms on a workload, and compare two configurations side by side.",
    ogImage: "og/sandbox.png",
  },
  {
    slug: "glossary",
    title: "Glossary",
    description: "Every term the chapters use, defined in one place.",
    ogImage: "og/glossary.png",
  },
] as const satisfies readonly Route[];

export type AppRoute = (typeof routes)[number];
export type Slug = AppRoute["slug"];

/** The document title for a route. */
export function pageTitle(route: Route): string {
  return route.slug === "" ? route.title : `${route.title} – serving-explained`;
}

/** A route's path below the site base: "/" or "/<slug>/". */
export function routePath(slug: string): string {
  return slug === "" ? "/" : `/${slug}/`;
}
