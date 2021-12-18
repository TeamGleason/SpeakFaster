/** Default context signals. */

import {ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';

export const DEFAULT_CONTEXT_SIGNALS: ConversationTurnContextSignal[] = [
  getConversationTurnContextSignal('', {
    startTimestamp: new Date(),
    speechContent: 'What\'s up',
    isHardcoded: true,
  }),
  getConversationTurnContextSignal('', {
    startTimestamp: new Date(),
    speechContent: 'What do you need',
    isHardcoded: true,
  }),
  getConversationTurnContextSignal('', {
    startTimestamp: new Date(),
    speechContent:
        'Good to see you, Sean. Nice day today. How are you feeling right now.',
    isHardcoded: true,
  }),
];
