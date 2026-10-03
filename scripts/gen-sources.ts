/**
 * Turns the table in docs/SOURCES.md into src/data/sources.json, which
 * <SourceLink id="…"> reads. Edit SOURCES.md, never the JSON; a test fails if
 * the JSON is stale.
 */
import { readFileSync, writeFileSync } from "node:fs";

export interface Source {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  url: string;
  citedFor: string;
  status: string;
}

const COLUMNS = [
  "id",
  "title",
  "authors",
  "venue or publisher",
  "year",
  "url",
  "cited for",
  "status",
];

/** The sources table, parsed. Throws if the table's shape changes. */
export function parseSources(markdown: string): Source[] {
  const lines = markdown.split("\n").filter((line) => line.startsWith("|"));
  const [headerLine, dividerLine, ...bodyLines] = lines;
  const cells = (line: string) =>
    line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
  const header = headerLine ? cells(headerLine) : [];
  if (
    header.join("|") !== COLUMNS.join("|") ||
    !dividerLine ||
    !/^\|[-| ]+\|$/.test(dividerLine)
  ) {
    throw new Error(`docs/SOURCES.md: expected columns ${COLUMNS.join(", ")}`);
  }
  const body = bodyLines.map(cells);
  return body.map((cells) => {
    const [
      id = "",
      title = "",
      authors = "",
      venue = "",
      year = "",
      url = "",
      citedFor = "",
      status = "",
    ] = cells;
    if (cells.length !== COLUMNS.length || !/^[a-z0-9-]+$/.test(id)) {
      throw new Error(`docs/SOURCES.md: malformed row for "${id}"`);
    }
    if (!/^https:\/\//.test(url))
      throw new Error(`docs/SOURCES.md: ${id} has no https URL`);
    return {
      id,
      title,
      authors,
      venue,
      year: Number(year),
      url,
      citedFor,
      status,
    };
  });
}

export function sourcesJson(markdown: string): string {
  const data = {
    _provenance: {
      source: "docs/SOURCES.md",
      generator: "scripts/gen-sources.ts",
    },
    sources: parseSources(markdown),
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

if (import.meta.main) {
  const json = sourcesJson(readFileSync("docs/SOURCES.md", "utf8"));
  writeFileSync("src/data/sources.json", json);
  const count = (JSON.parse(json) as { sources: unknown[] }).sources.length;
  console.log(`gen-sources: ${String(count)} sources`);
}
