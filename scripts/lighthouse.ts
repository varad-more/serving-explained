/**
 * Lighthouse on every live route, mobile (simulated slow 4G, 4× CPU) and
 * desktop (AUDIT.md §4). Runs one at a time through `pnpm dlx lighthouse@13`,
 * so Lighthouse is not a dependency. Run it with the machine otherwise idle.
 *
 * Usage: node scripts/lighthouse.ts [base URL]
 * Writes the full reports and summary.json to $AUDIT_OUT/lighthouse
 * (default test-results/audit-2).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { routePath, routes } from "../src/routes.ts";

const BASE = process.argv[2] ?? "https://varadmore.me/serving-explained/";
const OUT = `${process.env.AUDIT_OUT ?? "test-results/audit-2"}/lighthouse`;

interface Report {
  lighthouseVersion: string;
  categories: Record<string, { score: number | null }>;
  audits: Record<
    string,
    { numericValue?: number; details?: { items?: Record<string, unknown>[] } }
  >;
}

mkdirSync(OUT, { recursive: true });
const rows: Record<string, unknown>[] = [];
for (const route of routes) {
  for (const form of ["mobile", "desktop"] as const) {
    const name = `${route.slug || "landing"}-${form}`;
    const file = `${OUT}/${name}.json`;
    execFileSync(
      "pnpm",
      [
        "dlx",
        "lighthouse@13",
        BASE + routePath(route.slug).slice(1),
        "--output=json",
        `--output-path=${file}`,
        "--chrome-flags=--headless=new",
        "--quiet",
        ...(form === "desktop" ? ["--preset=desktop"] : []),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    const r = JSON.parse(readFileSync(file, "utf8")) as Report;
    const score = (k: string) =>
      Math.round((r.categories[k]?.score ?? 0) * 100);
    const num = (k: string) => r.audits[k]?.numericValue ?? NaN;
    const scripts = (r.audits["resource-summary"]?.details?.items ?? []).find(
      (i) => i.resourceType === "script",
    );
    rows.push({
      page: route.slug || "landing",
      form,
      version: r.lighthouseVersion,
      performance: score("performance"),
      accessibility: score("accessibility"),
      bestPractices: score("best-practices"),
      seo: score("seo"),
      lcpMs: Math.round(num("largest-contentful-paint")),
      fcpMs: Math.round(num("first-contentful-paint")),
      cls: +num("cumulative-layout-shift").toFixed(3),
      tbtMs: Math.round(num("total-blocking-time")),
      totalKB: Math.round(num("total-byte-weight") / 1024),
      scriptKB: Math.round(Number(scripts?.transferSize ?? 0) / 1024),
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(rows, null, 2));
