/** Types related to various types of context. */
import {createUuid} from '../../utils/uuid';

import {ConversationTurn} from './conversation';
import {PartnerProximityEvent} from './partner-proximity';

/**
 * The base type of contextual signals that are potentially useful for text
 * prediction.
 */
export interface ContextSignal {
  // A unique identifier for the user.
  readonly userId: string;
  // A unique identifier for the context signal. Typically a UUID.
  readonly contextId: string;
  // TODO(cais): Can this be required?
  readonly timestamp: Date;
  readonly timezone?: string;
  readonly isManuallyAdded?: boolean;
  readonly contextType: 'ConversationTurn'|'PartnerProximity';
}

export interface ConversationTurnContextSignal extends ContextSignal {
  readonly contextType: 'ConversationTurn';
  readonly conversationTurn: ConversationTurn;
}

export interface PartnerProximityContextSignal extends ContextSignal {
  readonly contextType: 'PartnerProximity';
  readonly partnerProximityEvent: PartnerProximityEvent;
}

export function getConversationTurnContextSignal(
    userId: string, conversationTurn: ConversationTurn,
    contextId?: string): ConversationTurnContextSignal {
  const signal: ConversationTurnContextSignal = {
    contextType: 'ConversationTurn',
    userId,
    conversationTurn,
    contextId: contextId || createUuid(),
    timestamp: conversationTurn.startTimestamp,
    timezone: conversationTurn.timezone,
  };
  // TODO(cais): Add unit tests.
  return signal;
}
