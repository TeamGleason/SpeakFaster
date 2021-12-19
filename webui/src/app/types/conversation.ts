/** Types related to conversations. */

/** A turn of conversation. */
export interface ConversationTurn {
  // ID of the speaker. The speaker may be the user ot a conversation partner of
  // the user. Use `null` if the speaker identity is unknown.
  readonly speakerId: string | null;

  // The content of speech in this turn of converation.
  readonly speechContent: string;

  // The time when the turn of conversation started.
  readonly startTimestamp: Date;

  // Optional time at which the turn of conversation ended.
  readonly endTimestamp?: Date;

  // Optional name of time zone in which the turn of conversation occurred.
  // Follows the format of the IANA time zone database
  // (https://www.iana.org/time-zones).
  readonly timezone?: string;

  // Whether this turn of conversation is spoken out when text-to-speech (TTS).
  readonly isTts?: boolean;

  // TODO(cais): Check validity.
  readonly isHardcoded?: boolean;
}
