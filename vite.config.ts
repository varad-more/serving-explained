import { fileURLToPath } from "node:url";
import mdx from "@mdx-js/rollup";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { SITE_URL } from "./scripts/site.ts";

export default defineConfig({
  base: new URL(SITE_URL).pathname,
  plugins: [{ enforce: "pre", ...mdx() }, react({ include: /\.(mdx|tsx?)$/ })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
