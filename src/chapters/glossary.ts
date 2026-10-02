export interface GlossaryEntry {
  /** The id a `GlossaryTerm` refers to. */
  id: string;
  term: string;
  definition: string;
}

/** Each chapter adds the terms it defines. */
export const glossary: readonly GlossaryEntry[] = [];
