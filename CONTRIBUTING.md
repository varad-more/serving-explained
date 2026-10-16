# Contributing

Thank you for helping. The most useful contribution is a correction: a claim
that its source does not support, or a number that is wrong.

## Report a technical error

Use the [technical error form](https://github.com/varad-more/serving-explained/issues/new?template=technical-error.yml).
Quote the claim, say where it appears, and link a source with its section.
Corrections come first: we reproduce the problem, fix it, add a test, and
credit you in [CHANGELOG.md](CHANGELOG.md).

For anything else that looks broken, use the
[bug report form](https://github.com/varad-more/serving-explained/issues/new?template=bug-report.yml).
If it happened in the sandbox, include its share link: the link reproduces
the run exactly.

## The truth rules

Every change follows these rules from [CLAUDE.md](CLAUDE.md):

> - Every technical claim cites a primary source listed in docs/SOURCES.md: a paper,
>   official docs, or a source file at a pinned commit. No source, no claim.
> - Every number on screen carries a provenance badge:
>   - `simulated`: produced by our toy engine.
>   - `computed`: produced by llmsize formulas (generated data in src/data).
>   - `measured`: read from a committed result file in the author's benchmark repos,
>     and linked to that file.
> - Never present simulated numbers as real-world performance.
> - Every chapter ends with "What this leaves out": one line per simplification.
> - Every claim the prose makes about the simulation ("continuous batching cuts
>   waiting under this preset") is asserted by a test against that preset. If the
>   test fails, the prose is wrong.
> - Never copy text or figures from papers or blogs. Paraphrase, cite, and draw
>   original diagrams.

## Propose a chapter

1. Open a [chapter idea](https://github.com/varad-more/serving-explained/issues/new?template=chapter-idea.yml):
   the mechanism, who it helps, its primary sources, and what the engine
   would need.
2. If it fits, write a plan that meets every item in
   [docs/CHAPTER_DOD.md](docs/CHAPTER_DOD.md), the checklist each chapter
   must pass.
3. The plan is agreed before any code is written.

## Run the checks

You need Node 24 and pnpm (`corepack enable`).

```sh
pnpm install
pnpm test        # unit, property, and chapter-claim tests (vitest)
pnpm typecheck   # strict TypeScript
pnpm lint        # ESLint and Prettier
pnpm build       # the static site in dist/
pnpm exec playwright install   # once, for the browsers
pnpm e2e         # Playwright in Chromium, WebKit, and Firefox
```

All five must pass before a pull request is merged. Screenshot baselines are
per platform: CI uses the Linux ones, which come from the manual
"Screenshot baselines (Linux)" workflow.

## Add a source

1. Add a row to the table in [docs/SOURCES.md](docs/SOURCES.md): an `id`, the
   title, authors, venue, year, URL, what it is cited for, and its status.
   Pin code and docs to a commit.
2. Run `pnpm gen:sources` to regenerate `src/data/sources.json`. A test fails
   if the JSON is stale.
3. Cite it in a chapter with `<SourceLink id="…" at="§4.2" />`. A test fails
   if a chapter uses an id that is not in the table.

Never edit `src/data/*.json` by hand: each file has a `pnpm gen:*` script.

## License of contributions

Contributed code is licensed under Apache-2.0. Contributed chapter and
glossary text, captures, and images are licensed under CC BY 4.0. The README's
License section lists which paths each covers.
