/** Types related to text injection. */

export interface TextEntryBeginEvent {
  // Milliseconds since the epoch.
  timestampMillis: number;
}

export interface TextEntryEndEvent {
  // A human-oriented, human-readable form of the injected text.
  text: string;

  // Total number of key presses, including backspaces, function keys and other
  // auxiliary keys used to enter the message. This includes the automatically
  // injected keypresses such as the ones from a word prediction engine.
  numKeypresses?: number;

  // Number of keypresses that are performed by the human (e.g., through eye
  // gaze). This is used in the calculation of keystroke savign rate (KSR).
  numHumanKeypresses?: number;

  // Timestamp for the injection, in milliseconds since the epoch.
  timestampMillis: number;

  // Whether the text entry is final.
  isFinal: boolean;

  // Sequence of injected keys;
  injectedKeys?: string[];
}
