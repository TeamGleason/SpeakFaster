/** Types related to abbreviations. */

export interface AbbreviationToken {
  value: string;
  isKeyword: boolean;
}

export interface AbbreviationSpec {
  tokens: AbbreviationToken[];
  readableString: string;
}

export interface InputAbbreviationChangedEvent {
  abbreviationSpec: AbbreviationSpec;
  triggerExpansion: boolean;
}
