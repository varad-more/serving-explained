# Launch checklist

Everything here is done by hand by the author. Nothing in this repo posts
or changes a setting.

## Before anything

- [ ] CI is green on `main`, and the audit is green (docs/AUDIT.md: no open
      blocker or major).
- [ ] Every route returns 200 on the live site.
- [ ] Every route's preview is checked:
  - [ ] Playwright: the smoke suite, `SMOKE_BASE_URL=https://varadmore.me/serving-explained/ pnpm exec playwright test e2e/smoke.spec.ts`
  - [ ] each platform's own preview, which you run: a draft post on X, the
        [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/),
        and a draft Reddit post
- [ ] You check the site on a real phone: a chapter, a figure, and the sandbox.
- [ ] The repo is public, with the settings in `repo-settings.md` applied.
- [ ] You pick the hero (README and LinkedIn use `media/hero-paged.gif`; the
      other candidate is `media/hero-batching.gif`).
- [ ] You write the HN title and first comment, and the r/LocalLLaMA post,
      from their fact sheets.
- [ ] You read each venue's rules again on the day (each file lists them with
      URLs).

## Order

1. Show HN, at a time you can answer comments for about 3 hours.
2. The X thread and LinkedIn the same day.
3. r/LocalLLaMA the next day.
4. r/MachineLearning per its rules: the main post, or the short version in
   the monthly self-promotion thread.

## Feedback

- Factual-error reports go first:
  1. reproduce the problem
  2. fix it, and add a test that would have caught it
  3. add a "Fixed" entry to CHANGELOG.md crediting the reporter
- Reply with the commit link.
- Put taste debates into issues.
- Never edit a post to hide a correction.
