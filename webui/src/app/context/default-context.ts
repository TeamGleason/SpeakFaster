/** Default context signals. */

import {createUuid} from 'src/utils/uuid';

import {ContextSignal} from '../speakfaster-service';

export const DEFAULT_CONTEXT_SIGNALS: ContextSignal[] = [
  {
    userId: '',
    conversationTurn: {
      startTimestamp: new Date().toISOString(),
      speechContent: 'What\'s up',  // Default context.
      isHardcoded: true,
    },
    contextId: createUuid(),
  },
  {
    userId: '',
    conversationTurn: {
      startTimestamp: new Date().toISOString(),
      speechContent: 'What do you need',  // Default context.
      isHardcoded: true,
    },
    contextId: createUuid(),
  }
];
