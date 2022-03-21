/** Types related to text entry events. */

import {TextToSpeechAudioConfig} from './text-to-speech';

/**
 * An event that signifies the beginning of a text entry, i.e., when the
 * users starts typing to compose a message.
 */
export interface TextEntryBeginEvent {
  // Milliseconds since the epoch.
  timestampMillis: number;
}


/**
 * An event that signifies the end or intermediate state of a user's text
 * entry. It is assumed to be paired with a previous TextEntryBeginEvent.
 * Whether the text entry has reached the end is determined by the `isFinal`
 * field.
 */
export interface TextEntryEndEvent {
  // A human-oriented, human-readable form of the entered text.
  // If text is an empty string and the field `repeatLast` is `true` (see below),
  // it is interpreted as repeating the last non-empty text output, e.g., for
  // TTS output.
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

  // Sequence of automatically injected keys;
  injectedKeys?: string[];

  // If specified, will trigger in-app text-to-speech, i.e., text-to-speech
  // output from this app per se, not text-to-speech output in another app like
  // the text editor tethereed to this app.
  inAppTextToSpeechAudioConfig?: TextToSpeechAudioConfig;

  // Whether this is an aborted text entry event.
  isAborted?: boolean;

  // Whether this end mean repeating the last non-empty text output.
  repeatLastNonEmpty?: boolean;
}
