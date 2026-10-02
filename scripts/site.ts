/**
 * The deployed site's URL, from the one env var the build reads. Its pathname
 * is Vite's base; canonical and preview-image URLs need the full origin.
 */
export const SITE_URL = withSlash(
  process.env.SITE_URL ?? "https://varadmore.me/serving-explained/",
);

function withSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}
