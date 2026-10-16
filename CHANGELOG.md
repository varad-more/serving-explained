# Changelog

Notable changes to serving-explained. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). A correction from a
reader is listed under "Fixed" and credits them, like this:
"Chapter 2: … (reported by @handle)".

## [1.0.0-rc] - 2026-10-16

### Added

- The launch kit: this changelog, CONTRIBUTING.md, issue forms for technical
  errors, bugs, and chapter ideas, and fact sheets and drafts in
  `docs/launch/`.
- Preview images rendered from the real widgets, for every route and for the
  repository.
- Captures of each chapter's main widget, and two hero candidates, recorded
  from the live site.

### Fixed

- Audit 2's ten major findings ([docs/AUDIT.md](docs/AUDIT.md), "Fixes"):
  - the repository had gone private, so the site's 39 links to docs/SIM.md
    returned 404; the author made it public
  - five claims reworded or re-cited to match their sources
  - a sandbox run that never ends when its worker fails to load
  - a blank page without JavaScript
  - a summary strip that told requests apart by color alone
  - chapters 3 and 4 blocking the page while it loads

## [0.9-audited] - 2026-10-16

### Added

- Audit 2 of the live site, and the tooling that runs it again.

## [0.8-sandbox] - 2026-10-15

### Added

- The sandbox: every chapter's mechanism on one workload, with A/B
  comparison and share links that reproduce a run exactly.

## [0.7-ch4] - 2026-10-15

### Added

- Chapter 4: prefix caching.

## [0.6-ch3] - 2026-10-15

### Added

- Chapter 3: continuous batching, with a measured callout from
  inference-engine-benchmark-system.

## [0.5-ch2] - 2026-10-15

### Added

- Chapter 2: paged attention.

## [0.4-ch1] - 2026-10-04

### Added

- Chapter 1: the KV cache.

## [0.3-shell] - 2026-10-02

### Added

- The site shell, the simulated engine, and the design system.

[1.0.0-rc]: https://github.com/varad-more/serving-explained/compare/v0.9-audited...v1.0.0-rc
[0.9-audited]: https://github.com/varad-more/serving-explained/compare/v0.8-sandbox...v0.9-audited
[0.8-sandbox]: https://github.com/varad-more/serving-explained/compare/v0.7-ch4...v0.8-sandbox
[0.7-ch4]: https://github.com/varad-more/serving-explained/compare/v0.6-ch3...v0.7-ch4
[0.6-ch3]: https://github.com/varad-more/serving-explained/compare/v0.5-ch2...v0.6-ch3
[0.5-ch2]: https://github.com/varad-more/serving-explained/compare/v0.4-ch1...v0.5-ch2
[0.4-ch1]: https://github.com/varad-more/serving-explained/compare/v0.3-shell...v0.4-ch1
[0.3-shell]: https://github.com/varad-more/serving-explained/releases/tag/v0.3-shell
