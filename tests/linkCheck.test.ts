import { describe, expect, it } from "vitest";
import { urlsIn, verdict } from "../scripts/link-check.ts";

describe("the link check (AUDIT.md m2)", () => {
  it("finds URLs without trailing punctuation or markdown", () => {
    expect(
      urlsIn(
        "See [x](https://a.org/p?q=1). Also https://b.org/x, `${SITE}` and http://localhost:4173/.",
      ),
    ).toEqual(["https://a.org/p?q=1", "https://b.org/x"]);
  });

  it("counts a Cloudflare challenge as reachable, other 4xx as failed", () => {
    expect(verdict(200, new Headers())).toBe("ok");
    expect(verdict(403, new Headers({ "cf-mitigated": "challenge" }))).toBe(
      "challenge",
    );
    expect(verdict(403, new Headers())).toBe("fail");
    expect(verdict(404, new Headers())).toBe("fail");
  });
});
