/** Types related to abbreviations. */

import {VIRTUAL_KEY} from '../external/external-events.component';

export type WordAbbrevMode = 'PREFIX'|'CONSONANTS_WITH_INITIAL_VOWEL';

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

  // Word abbreviation mode. If undefined and `isKeyword` is true, this means
  // this token is a complete keyword.
  readonly wordAbbrevMode?: WordAbbrevMode;
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

  // Key sequence used to trigger the abbreviation expansion request.
  readonly triggerKeys?: Array<string|VIRTUAL_KEY>;

  // Preceding text as context, optional.
  readonly precedingText?: string;

  // The sequence of keys that can erase the abbreviation and characters
  // that resulted from the trigger keys, which can be used for key
  // injection later.
  readonly eraserSequence?: VIRTUAL_KEY[];

  // Unique ID for the lineage of abbreviations.
  // Derived abbreviations will share the same ID as the original one.
  // A lineage of abbreviations is generated when the user incrementally
  // spells words out in the intended phrase in order to overcome possible
  // initial abbreviation expansion failure. E.g., the intended phrase is "I
  // feel grumpy", which is initially abbreviated as "ifg". But suppose the
  // initially expansion call fails to find the phrase, the user types out the
  // word "grumpy", which leads to a second abbreviation in the lineage: "if
  // grumpy".
  readonly lineageId: string;
}

/** An event that signifies the change in an input abbreviation */
export interface InputAbbreviationChangedEvent {
  // Specification for the abbreviation.
  readonly abbreviationSpec: AbbreviationSpec;

  // Whether abbreviation expansion is requested.
  readonly requestExpansion: boolean;
}
