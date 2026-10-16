/**
 * Checks every external link in the repo's text and the site's source
 * (AUDIT.md m2). A 403 that carries `cf-mitigated: challenge` is Cloudflare's
 * bot check, not a broken link: it counts as reachable and is listed.
 *
 * Usage: node scripts/link-check.ts [more-urls.json …]
 * Each extra file holds a JSON array of URLs (the audit's in-site crawl
 * writes one). Writes $AUDIT_OUT/links/external.json (default
 * test-results/audit-2) and exits 1 if any link fails.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** The http(s) URLs in a text, without trailing punctuation. */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>"'`)\]|}]+/g)]
    .map((m) => m[0].replace(/[.,;:*]+$/, ""))
    .filter((u) => !u.includes("${") && !/localhost|example\.com/.test(u));
}

export type Verdict = "ok" | "challenge" | "fail";

export function verdict(status: number, headers: Headers): Verdict {
  if (status < 400) return "ok";
  if (status === 403 && headers.get("cf-mitigated") === "challenge")
    return "challenge";
  return "fail";
}

export interface Result {
  url: string;
  status: number;
  final: string;
  verdict: Verdict;
  error?: string;
}

async function check(url: string): Promise<Result> {
  let last: Result = { url, status: 0, final: url, verdict: "fail" };
  // GitHub answers bursts with brief 503s: wait and retry before failing.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000 * attempt));
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "serving-explained link check" },
        signal: AbortSignal.timeout(20_000),
      });
      await res.body?.cancel();
      last = {
        url,
        status: res.status,
        final: res.url,
        verdict: verdict(res.status, res.headers),
      };
      if (last.verdict !== "fail") return last;
    } catch (e) {
      last = { ...last, error: String(e) };
    }
  }
  return last;
}

/** Checks URLs eight at a time; results in URL order. */
export async function checkUrls(urls: readonly string[]): Promise<Result[]> {
  const results: Result[] = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift())
        results.push(await check(u));
    }),
  );
  return results.sort((a, b) => a.url.localeCompare(b.url));
}

async function main() {
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "*.md",
      "src/**/*.ts",
      "src/**/*.tsx",
      "src/**/*.mdx",
      "src/data/*.json",
    ],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const where = new Map<string, Set<string>>();
  const add = (url: string, from: string) => {
    where.set(url, (where.get(url) ?? new Set()).add(from));
  };
  for (const f of files)
    for (const u of urlsIn(readFileSync(f, "utf8"))) add(u, f);
  for (const f of process.argv.slice(2))
    for (const u of JSON.parse(readFileSync(f, "utf8")) as string[]) add(u, f);

  const urls = [...where.keys()].sort();
  const results = await checkUrls(urls);
  const report = results.map((r) => ({
    ...r,
    from: [...(where.get(r.url) ?? [])],
  }));
  const out = `${process.env.AUDIT_OUT ?? "test-results/audit-2"}/links`;
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/external.json`, JSON.stringify(report, null, 2));
  const count = (v: Verdict) => results.filter((r) => r.verdict === v);
  console.log(
    `${String(urls.length)} links: ${String(count("ok").length)} ok, ${String(count("challenge").length)} Cloudflare challenge, ${String(count("fail").length)} failed`,
  );
  for (const r of [...count("challenge"), ...count("fail")])
    console.log(
      `  ${r.verdict} ${String(r.status)} ${r.url}${r.error ? ` (${r.error})` : ""}`,
    );
  if (count("fail").length) process.exitCode = 1;
}

if (import.meta.main) await main();
