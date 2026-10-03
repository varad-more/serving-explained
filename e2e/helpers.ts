import type { Page } from "@playwright/test";

export const SITE_URL = "https://varadmore.me/serving-explained/";
export const BASE =
  process.env.SMOKE_BASE_URL ?? "http://localhost:4173/serving-explained/";
export const KITCHEN = "http://localhost:4174/serving-explained/kitchen-sink/";

/** Console errors, page errors, and failed responses, collected for a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${String(r.status())}: ${r.url()}`);
  });
  return errors;
}
