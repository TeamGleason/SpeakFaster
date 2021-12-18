/** Types related to conversations. */

export interface ConversationTurn {
  readonly speakerId?: string;
  readonly speechContent: string;
  readonly startTimestamp: Date;
  readonly endTimestamp?: Date;
  readonly timezone?: string;
  // TODO(cais): Check validity.
  readonly isHardcoded?: boolean;
  readonly isTts?: boolean;
}
