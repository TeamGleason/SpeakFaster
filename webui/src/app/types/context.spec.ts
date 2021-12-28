/** Unit tests for context.ts. */

import {getConversationTurnContextSignal} from './context';

describe('getConversationTurnContextSignal', () => {
  it('creates ConversationTurnContextSignal correctly, populating timestamp',
     () => {
       const signal = getConversationTurnContextSignal('foo_user', {
         speakerId: 'bar_speaker',
         speechContent: 'greetings, mate!',
         startTimestamp: new Date(123456),
       });
       expect(signal.userId).toEqual('foo_user');
       expect(signal.contextId.length).toBeGreaterThan(0);
       expect(signal.timestamp.getTime()).toEqual(123456);
       expect(signal.conversationTurn.speakerId).toEqual('bar_speaker');
       expect(signal.conversationTurn.speechContent)
           .toEqual('greetings, mate!');
       expect(signal.conversationTurn.startTimestamp.getTime()).toEqual(123456);
       expect(signal.isHardcoded).toBeUndefined();
     });

  it('preserves provided contextId', () => {
    const signal = getConversationTurnContextSignal(
        'foo_user', {
          speakerId: 'bar_speaker',
          speechContent: 'greetings, mate!',
          startTimestamp: new Date(123456),
        },
        '1234abcd');
    expect(signal.contextId).toEqual('1234abcd');
  });

  it('preserves isHardcoded', () => {
    const signal = getConversationTurnContextSignal(
      'foo_user', {
        speakerId: 'bar_speaker',
        speechContent: 'greetings, mate!',
        startTimestamp: new Date(123456),
        isHardcoded: true
      });
      expect(signal.isHardcoded).toEqual(true);
  });
});
