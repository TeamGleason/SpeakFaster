/** Context for conversation. */

export interface ConversationTurn {
  startTime: Date;
  endTime?: Date;
  speaker: string|null;
  content: string;
}

export interface ConversationContext {
  turns: ConversationTurn[];
}
