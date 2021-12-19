/** Types related to abbreviations. */

/**
 * A token in an abbreviation. In the context of abbreviation, a token is
 * defined as a unit that represents a word. It can be:
 * - A single character that represents a word (e.g., "newspaper" --> "n")
 * - A string of multiple character that represents a word (e.g., "newspaper"
 * --> "np")
 * - The word in its literal form (i.e., a "keyword").
 */
export interface AbbreviationToken {
  // The face form of the abbreviation token.
  readonly value: string;

  // Whether this token is word in its literal form, i.e., a keyword.
  readonly isKeyword: boolean;
}

/**
 * The specification of an abbreviation that represents a phrase or sentence.
 */
export interface AbbreviationSpec {
  // All abbreviation tokens in the abbreviation, in the corresponding order.
  readonly tokens: AbbreviationToken[];

  // A readable string representation of the abbreviation. If the abbreviation
  // contains no keyword tokens, this may be a simple concatenation of all the
  // abbreviations (e.g., "why did you do that" --> "wdydt"). In the presence
  // of keyword(s), the keyword abbreviation tokens may be separated from
  // adjacent tokens by spaces (e.g., "why did you do that" --> "wdy do t").
  readonly readableString: string;
}

/** An event that signifies the change in an input abbreviation */
export interface InputAbbreviationChangedEvent {
  // Specification for the abbrevaition.
  readonly abbreviationSpec: AbbreviationSpec;

  // Whether abbreviation expansion is requested.
  readonly requestExpansion: boolean;
}

/** An event that signifies the starting of spelling out of an abbreviation. */
export interface StartSpellingEvent {
  readonly originalAbbreviationChars: string[];
  readonly isNewSpellingTask: boolean;
}

