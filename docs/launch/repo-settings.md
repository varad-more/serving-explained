# Repo settings

The author applies these by hand at
https://github.com/varad-more/serving-explained. Nothing in this repo changes
GitHub settings.

## The values

- **Description** (GitHub's own limit is not documented; this is 131
  characters):

  ```text
  Interactive explainers of how LLM servers manage GPU memory and schedule requests, run on a small simulated engine in your browser.
  ```

- **Website:** `https://varadmore.me/serving-explained/`
- **Topics** (14; GitHub allows at most 20, each 50 characters or less,
  lowercase letters, numbers, and hyphens):

  ```text
  llm llm-inference llm-serving vllm kv-cache paged-attention continuous-batching prefix-caching explainer interactive simulation education typescript react
  ```

- **Social preview:** `docs/launch/social-preview.png`, 1280 × 640, 210 KB.
  GitHub asks for under 1 MB and recommends 1280 × 640.
- **Issue labels** the issue forms apply: `technical-error` and
  `chapter-idea`. `bug` exists by default. A form's label is applied only if
  the label exists.

## What to click

1. **About** (the gear beside "About" on the repo's main page):
   1. Paste the description.
   2. Paste the website.
   3. Add the 14 topics.
   4. Leave "Releases", "Packages", and "Deployments" as they are.
   5. Save changes.
2. **Settings → General → Social preview:** Edit → Upload an image → choose
   `docs/launch/social-preview.png`.
3. **Settings → General → Features:** keep Issues on, since the issue forms
   need it.
4. **Issues → Labels → New label**, twice:
   1. `technical-error`, description "A claim or number its source does not
      support".
   2. `chapter-idea`, description "A mechanism for a new chapter".
5. **Settings → Pages:** check that Source is "GitHub Actions". It is already
   set; nothing to change.
6. **Optional:** Releases → Draft a new release → choose the tag
   `v1.0.0-rc` → mark it as a pre-release → publish. That publishes, so it is
   your call.

## The same with the GitHub CLI

If you prefer, these do steps 1 and 4. The social preview has no API: upload
it in the browser.

```sh
gh repo edit varad-more/serving-explained \
  --description "Interactive explainers of how LLM servers manage GPU memory and schedule requests, run on a small simulated engine in your browser." \
  --homepage "https://varadmore.me/serving-explained/" \
  --add-topic llm,llm-inference,llm-serving,vllm,kv-cache,paged-attention,continuous-batching,prefix-caching,explainer,interactive,simulation,education,typescript,react
gh label create technical-error -R varad-more/serving-explained \
  --description "A claim or number its source does not support"
gh label create chapter-idea -R varad-more/serving-explained \
  --description "A mechanism for a new chapter"
```
