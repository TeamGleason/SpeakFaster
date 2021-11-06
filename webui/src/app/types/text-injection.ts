/** Types related to text injection. */

export interface TextInjection {
  // A human-oriented, human-readable form of the injected text.
  text: string;

  // Timestamp for the injection, in milliseconds since the epoch.
  timestampMillis: number;

  // Sequence of injected keys;
  injectedKeys?: string[];
}