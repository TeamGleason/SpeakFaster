/** Types related to abbreviations. */

export interface AbbreviationToken {
  readonly value: string;
  readonly isKeyword: boolean;
}

export interface AbbreviationSpec {
  readonly tokens: AbbreviationToken[];
  readonly readableString: string;
}

export interface InputAbbreviationChangedEvent {
  readonly abbreviationSpec: AbbreviationSpec;
  readonly triggerExpansion: boolean;
}

export interface StartSpellingEvent {
  readonly originalAbbreviationChars: string[];
  readonly isNewSpellingTask: boolean;
}

export interface AbbreviationExpansionSelectionEvent {
  // The expansion option selected.
  readonly expansionText: string;
  // TODO(cais): Add original AbbreviationSpec.
}
