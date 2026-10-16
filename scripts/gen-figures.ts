/**
 * Generates src/data/figures-<slug>.json: every number chapters 3 and 4
 * quote, so their pages run no simulation to render the prose (AUDIT.md
 * P1). numbers.tsx imports widget helpers written in TSX, so it loads
 * through Vite's SSR loader. tests/data/figures.test.ts fails if a file is
 * stale. Never edit the JSON by hand: rerun `pnpm gen:figures`.
 */
import { writeFileSync } from "node:fs";
import { createServer } from "vite";

export const CHAPTERS = ["continuous-batching", "prefix-caching"] as const;

export const figuresFile = (slug: string) => `src/data/figures-${slug}.json`;

/** The JSON form of a chapter's numbers, as the page will read them. */
export const serialize = (f: unknown) => `${JSON.stringify(f, null, 2)}\n`;

if (import.meta.main) {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });
  try {
    for (const slug of CHAPTERS) {
      const mod = (await vite.ssrLoadModule(
        `/src/chapters/${slug}/numbers.tsx`,
      )) as { F: unknown };
      writeFileSync(figuresFile(slug), serialize(mod.F));
      console.log(`wrote ${figuresFile(slug)}`);
    }
  } finally {
    await vite.close();
  }
}
