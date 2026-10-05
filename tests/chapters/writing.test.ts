/**
 * CLAUDE.md's writing rules (CHAPTER_DOD item 5), checked on every chapter's
 * MDX: sentence length, hype words, US spelling, and glossary ids.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createProcessor } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";
import { glossary } from "../../src/chapters/glossary.ts";
import sources from "../../src/data/sources.json" with { type: "json" };

interface Node {
  type: string;
  name?: string | null;
  value?: unknown;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
}

const MAX_WORDS = 25;
const HYPE = [
  "revolutionary",
  "blazing",
  "magic",
  "magical",
  "game-changing",
  "groundbreaking",
  "cutting-edge",
  "lightning",
  "incredible",
  "amazing",
  "seamless",
  "supercharge",
  "unleash",
  "insanely",
];
const UK =
  /\b(colour|behaviour|optimis|analyse|centre|modelled|modelling|favour|labelled|labelling)/i;

const chapters = readdirSync("src/chapters", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `src/chapters/${d.name}/index.mdx`);

const parse = (mdx: string) => createProcessor().parse(mdx) as unknown as Node;

/** Inline text as a reader sees it; <Num> and <SourceLink> count as one word. */
function inline(node: Node): string {
  if (node.type === "text" || node.type === "inlineCode")
    return String(node.value);
  if (node.type === "mdxTextExpression") return "X";
  if (node.type === "mdxJsxTextElement" && node.name === "Num") return "N";
  if (node.type === "mdxJsxTextElement" && node.name === "SourceLink")
    return "S";
  if (node.type === "break") return " ";
  return (node.children ?? []).map(inline).join("");
}

/** Every paragraph, heading, and table cell, including JSX in attributes. */
function blocks(node: Node): string[] {
  const own = ["paragraph", "heading", "tableCell"].includes(node.type)
    ? [inline(node)]
    : [];
  const fromAttributes = (node.attributes ?? []).flatMap((a) => {
    const v = a.value as { type?: string; value?: string } | null;
    if (v?.type !== "mdxJsxAttributeValueExpression" || !v.value) return [];
    const jsx = v.value.trim();
    if (!jsx.startsWith("<")) return [];
    // Unwrap a fragment; MDX parses the rest as markdown with JSX.
    return blocks(parse(jsx.replace(/^<>/, "<p>").replace(/<\/>$/, "</p>")));
  });
  const inner = own.length > 0 ? [] : (node.children ?? []).flatMap(blocks);
  return [...own, ...fromAttributes, ...inner];
}

function sentences(text: string): string[] {
  return (
    text
      .replace(/\s+/g, " ")
      // A sentence can end inside a closing quote or bracket: ".", "?)".
      .split(/(?<=[.!?]["”’)]?)\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const words = (sentence: string) =>
  sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

function walk(node: Node, visit: (n: Node) => void) {
  visit(node);
  for (const a of node.attributes ?? []) {
    const v = a.value as { type?: string; value?: string } | null;
    if (
      v?.type === "mdxJsxAttributeValueExpression" &&
      v.value?.trim().startsWith("<")
    )
      walk(
        parse(v.value.replace(/^<>/, "<p>").replace(/<\/>$/, "</p>")),
        visit,
      );
  }
  for (const c of node.children ?? []) walk(c, visit);
}

const attr = (n: Node, name: string) =>
  n.attributes?.find((a) => a.name === name)?.value;

describe.each(chapters)("%s", (file) => {
  const mdx = readFileSync(file, "utf8");
  const tree = parse(mdx);
  const text = blocks(tree);

  it(`has no sentence of ${String(MAX_WORDS)} words or more`, () => {
    const long = text
      .flatMap(sentences)
      .filter((s) => words(s).length >= MAX_WORDS)
      .map((s) => `${String(words(s).length)}: ${s}`);
    expect(long).toEqual([]);
  });

  it("uses no hype word and US spelling", () => {
    const all = text.join(" ").toLowerCase();
    expect(HYPE.filter((w) => new RegExp(`\\b${w}\\b`).test(all))).toEqual([]);
    expect(all.match(UK)?.[0]).toBeUndefined();
  });

  it("uses only GlossaryTerm ids that exist", () => {
    const ids = new Set(glossary.map((e) => e.id));
    const used: string[] = [];
    walk(tree, (n) => {
      if (n.name === "GlossaryTerm") used.push(String(attr(n, "id")));
    });
    expect(used.filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("the glossary", () => {
  it("has unique ids, and every source id is in docs/SOURCES.md", () => {
    const known = new Set(sources.sources.map((s) => s.id));
    expect(new Set(glossary.map((e) => e.id)).size).toBe(glossary.length);
    expect(
      glossary.flatMap((e) =>
        e.source && !known.has(e.source.id) ? [e.id] : [],
      ),
    ).toEqual([]);
  });

  it(`definitions follow the same rules`, () => {
    const bad = glossary.flatMap((e) =>
      sentences(e.definition).filter((s) => words(s).length >= MAX_WORDS),
    );
    expect(bad).toEqual([]);
  });
});

describe("the sentence counter", () => {
  it("counts a parsed MDX sentence the way a reader would", () => {
    const [block] = blocks(
      parse(
        'One <GlossaryTerm id="x">two</GlossaryTerm> <Num value={3} kind="computed" /> four (<SourceLink id="y" />). Five.',
      ),
    );
    expect(sentences(block ?? "").map((s) => words(s).length)).toEqual([5, 1]);
    expect(sentences('"One two." Three.').map((s) => words(s).length)).toEqual([
      2, 1,
    ]);
  });
});
