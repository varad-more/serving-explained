/**
 * The launch kit (tasks/todo.md, Prompt 9, "Tests"): README length, the
 * writing rules on every launch text, post limits, media sizes, and links.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createProcessor } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";
import { checkUrls, urlsIn } from "../scripts/link-check.ts";

interface Node {
  type: string;
  value?: string;
  lang?: string | null;
  children?: Node[];
}

const MAX_WORDS = 25;
const HYPE =
  /\b(revolutionary|blazing|magic|magical|game-changing|groundbreaking|cutting-edge|lightning|incredible|amazing|seamless|supercharge|unleash|insanely)\b/i;

const LAUNCH = readdirSync("docs/launch")
  .filter((f) => f.endsWith(".md"))
  .map((f) => `docs/launch/${f}`);
const TEXTS = ["README.md", "CONTRIBUTING.md", "CHANGELOG.md", ...LAUNCH];
const read = (file: string) => readFileSync(file, "utf8");

const parse = (md: string) =>
  createProcessor({ format: "md" }).parse(md) as unknown as Node;

/** Text as a reader sees it: a link is its text, code is one word. */
function inline(node: Node): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "inlineCode") return "code";
  if (node.type === "break") return " ";
  return (node.children ?? []).map(inline).join("");
}

/**
 * Every paragraph and table cell, plus each line of a ```text block (a post
 * as it is pasted). Not headings (titles) or other code blocks.
 */
function blocks(node: Node): string[] {
  if (node.type === "code")
    return node.lang === "text" ? (node.value ?? "").split("\n") : [];
  if (node.type === "heading") return [];
  if (node.type === "paragraph" || node.type === "tableCell")
    return [inline(node)];
  return (node.children ?? []).flatMap(blocks);
}

const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?]["”’)]?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const words = (s: string) =>
  s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

/** Characters as code points, the way X and HN count them. */
const chars = (text: string) => Array.from(text).length;

/** X counts every URL as 23 characters (docs.x.com, "Counting characters"). */
const xLength = (text: string) =>
  chars(text.replace(/https?:\/\/\S+/g, "x".repeat(23)));

/** The ```text block under each "## Post" heading: the post as pasted. */
function posts(md: string): string[] {
  return md
    .split(/^## Post\b.*$/m)
    .slice(1)
    .map((section) => /```text\n([\s\S]*?)\n```/.exec(section)?.[1] ?? "")
    .filter(Boolean);
}

const pngSize = (file: string) => {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const gifWidth = (file: string) => readFileSync(file).readUInt16LE(6);

describe("README", () => {
  it("is at most 130 lines", () => {
    expect(read("README.md").split("\n").length).toBeLessThanOrEqual(130);
  });
});

describe.each(TEXTS)("%s follows the writing rules", (file) => {
  const text = blocks(parse(read(file)));

  it("has no sentence of 25 words or more", () => {
    const long = text
      .flatMap(sentences)
      .filter((s) => words(s).length >= MAX_WORDS)
      .map((s) => `${String(words(s).length)}: ${s}`);
    expect(long).toEqual([]);
  });

  it("uses no hype words", () => {
    expect(text.filter((t) => HYPE.test(t))).toEqual([]);
  });
});

describe("post limits", () => {
  it("the Show HN title, once written, starts with 'Show HN: ' and is at most 80 characters", () => {
    const title = /^Title:[ \t]*(.*)$/m.exec(read("docs/launch/show-hn.md"));
    expect(title).not.toBeNull();
    const t = title?.[1]?.trim() ?? "";
    if (t === "") return; // The author writes it (decision 7).
    expect(t.startsWith("Show HN: ")).toBe(true);
    expect(chars(t)).toBeLessThanOrEqual(80);
  });

  it("every X post is at most 280 characters, counting a URL as 23", () => {
    const xs = posts(read("docs/launch/x-thread.md"));
    expect(xs.length).toBeGreaterThanOrEqual(6);
    expect(xs.length).toBeLessThanOrEqual(8);
    expect(xs.map(xLength).filter((n) => n > 280)).toEqual([]);
  });

  it("the LinkedIn post is within 3,000 characters", () => {
    const [post = ""] = posts(read("docs/launch/linkedin.md"));
    expect(post.length).toBeGreaterThan(0);
    expect(chars(post)).toBeLessThanOrEqual(3000);
  });

  it("CONTRIBUTING quotes the truth rules exactly as CLAUDE.md states them", () => {
    const rules = read("CLAUDE.md");
    const quoted = read("CONTRIBUTING.md")
      .split("\n")
      .filter((l) => l.startsWith("> "))
      .map((l) => l.slice(2));
    expect(quoted.length).toBeGreaterThan(5);
    for (const line of quoted) expect(rules).toContain(line);
  });
});

describe("media", () => {
  const gifs = readdirSync("media").filter((f) => f.endsWith(".gif"));

  it.each(gifs)("%s is 600 px wide and under its size limit", (gif) => {
    const file = `media/${gif}`;
    expect(gifWidth(file)).toBe(600);
    const limit = gif.startsWith("hero") ? 5_000_000 : 3_000_000;
    expect(statSync(file).size).toBeLessThan(limit);
  });

  const ffprobe = spawnSync("ffprobe", ["-version"]).error === undefined;
  const mp4s = readdirSync("media").filter((f) => f.endsWith(".mp4"));
  it.skipIf(!ffprobe).each(mp4s)("%s lasts 6 to 10 s", (mp4) => {
    const out = spawnSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      `media/${mp4}`,
    ]);
    const s = Number(out.stdout.toString().trim());
    expect(s).toBeGreaterThanOrEqual(6);
    expect(s).toBeLessThanOrEqual(10);
  });
  if (!ffprobe)
    it("skips the MP4 durations: ffprobe is missing (brew install ffmpeg)", () => {
      expect(ffprobe).toBe(false);
    });

  it("the social preview is 1280 × 640 and under 1 MB", () => {
    const file = "docs/launch/social-preview.png";
    expect(pngSize(file)).toEqual([1280, 640]);
    expect(statSync(file).size).toBeLessThan(1_000_000);
  });

  it.each(readdirSync("public/og").filter((f) => f.endsWith(".png")))(
    "public/og/%s is 1200 × 630",
    (png) => {
      expect(pngSize(`public/og/${png}`)).toEqual([1200, 630]);
    },
  );
});

// Network: run with LINK_CHECK=1 (pnpm test:links), so `pnpm test` and CI
// never fail on another site's outage.
describe.runIf(process.env.LINK_CHECK === "1")("links", () => {
  it("every link in the launch texts resolves", async () => {
    const urls = [...new Set(TEXTS.flatMap((f) => urlsIn(read(f))))];
    const failed = (await checkUrls(urls)).filter((r) => r.verdict === "fail");
    expect(failed.map((r) => `${String(r.status)} ${r.url}`)).toEqual([]);
  }, 120_000);
});
