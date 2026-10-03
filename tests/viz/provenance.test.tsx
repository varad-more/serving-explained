import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProvenanceBadge } from "../../src/viz/ui/ProvenanceBadge.tsx";

describe("ProvenanceBadge", () => {
  it("renders each kind with its text; measured links to its file", () => {
    expect(
      renderToStaticMarkup(<ProvenanceBadge kind="simulated" />),
    ).toContain(">simulated<");
    expect(renderToStaticMarkup(<ProvenanceBadge kind="computed" />)).toContain(
      ">computed<",
    );
    const measured = renderToStaticMarkup(
      <ProvenanceBadge kind="measured" href="https://example.com/r.json" />,
    );
    expect(measured).toMatch(/^<a [^>]*href="https:\/\/example.com\/r.json"/);
  });

  it("does not type-check measured without href", () => {
    // @ts-expect-error a measured number must link to its result file
    const badge = <ProvenanceBadge kind="measured" />;
    expect(badge).toBeTruthy();
  });
});
