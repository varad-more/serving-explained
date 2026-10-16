interface ImportMetaEnv {
  /** "1" builds the kitchen sink into a production bundle (for Playwright). */
  readonly VITE_KITCHEN_SINK?: string;
  /** "1" builds the preview cards that scripts/gen-og.ts screenshots. */
  readonly VITE_OG?: string;
}
