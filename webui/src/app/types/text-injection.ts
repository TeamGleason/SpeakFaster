/** Types related to text injection. */

export interface TextEntryBeginEvent {
  // Milliseconds since the epoch.
  timestampMillis: number;
}

export interface TextInjection {
  // A human-oriented, human-readable form of the injected text.
  text: string;

  // Total number of key presses, including backspaces, function keys and other
  // auxiliary keys used to enter the message.
  numKeypresses?: number;

  // Timestamp for the injection, in milliseconds since the epoch.
  timestampMillis: number;

  // Whether the injection is final.
  isFinal: boolean;

  // Sequence of injected keys;
  injectedKeys?: string[];
}
