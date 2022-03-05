/** Default context signals. */

import {ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';

export const DEFAULT_CONTEXT_SIGNALS: ConversationTurnContextSignal[] = [
  getConversationTurnContextSignal('', {
    speakerId: null,
    startTimestamp: new Date(),
    speechContent: 'What\'s up',
    isHardcoded: true,
  }),
  getConversationTurnContextSignal('', {
    speakerId: null,
    startTimestamp: new Date(),
    speechContent: 'What do you need',
    isHardcoded: true,
  }),
  getConversationTurnContextSignal('', {
    speakerId: null,
    startTimestamp: new Date(),
    speechContent:
        'How are you feeling right now?',
    isHardcoded: true,
  }),
];
