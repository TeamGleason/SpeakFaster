/** Types related to various types of context. */
import {createUuid} from '../../utils/uuid';

import {ConversationTurn} from './conversation';
import {PartnerProximityEvent} from './partner-proximity';

type ContextType = 'ConversationTurn'|'PartnerProximity';

/**
 * The base type of contextual signals that are potentially useful for text
 * prediction.
 */
export interface ContextSignal {
  // A type enum. Must be overridden by sub-interfaces for more concrete
  // context signals.
  readonly contextType: ContextType;

  // A unique identifier for the user. Note: This is the ID of the text
  // prediction user, whhich is not necessarily the same as the person or entity
  // that generated the contextual signal. For example, in the case of a turn
  // of conversation spoken by a conversation partner of the user, this userId
  // is an ID for the user, not one for the conversation partner.
  readonly userId: string;

  // A unique identifier for the context signal. Typically a UUID.
  readonly contextId: string;

  // Time at which the context signal occurred. For a long-running context
  // signal, this is assumed to be the starting time.
  readonly timestamp: Date;

  // Optional name of the time zone in which the context signal occurred.
  // Follows the format of the IANA time zone database
  // (https://www.iana.org/time-zones).
  readonly timezone?: string;

  // Whether this context signal is added manually (as versus detected by
  // mechanisms such as ASR and user-entered text.)
  readonly isHardcoded?: boolean;
}

/** Specialization of ContextSignal for a turn of conversation. */
export interface ConversationTurnContextSignal extends ContextSignal {
  readonly contextType: 'ConversationTurn';

  readonly conversationTurn: ConversationTurn;
}

/**
 * Specalizaton of ContextSignal for the proximity event relating to a
 * converation partner.
 */
export interface PartnerProximityContextSignal extends ContextSignal {
  readonly contextType: 'PartnerProximity';

  readonly partnerProximityEvent: PartnerProximityEvent;
}

/**
 * Constructs an instance of ConversationTurnContextSignal.
 *
 * If contextId is undefined, a new ID will be created and attached to the
 * return value.
 */
export function getConversationTurnContextSignal(
    userId: string, conversationTurn: ConversationTurn,
    contextId?: string): ConversationTurnContextSignal {
  return {
    contextType: 'ConversationTurn',
    userId,
    conversationTurn,
    contextId: contextId || createUuid(),
    timestamp: conversationTurn.startTimestamp,
    timezone: conversationTurn.timezone,
    isHardcoded: conversationTurn.isHardcoded,
  };
}
