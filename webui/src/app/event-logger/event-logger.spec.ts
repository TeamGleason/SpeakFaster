/** Unit tests for event-logger-impl. */

import {createUuid} from 'src/utils/uuid';

import {AbbreviationSpec} from '../types/abbreviation';
import {ContextualPhrase} from '../types/contextual_phrase';

import {getAbbreviationExpansionRequestStats, getAbbreviationExpansionResponseStats, getContextualPhraseStats, getPhraseStats} from './event-logger-impl';

describe('EventLogger', () => {
  describe('getPhraseStats', () => {
    it('returns correct value for empy string', () => {
      expect(getPhraseStats('')).toEqual({
        charLength: 0,
        numWords: 0,
        numPunctuation: 0,
      });
    });


    it('returns correct value for single word', () => {
      expect(getPhraseStats('hello')).toEqual({
        charLength: 5,
        numWords: 1,
        numPunctuation: 0,
      });
    });

    it('returns correct value for multi-word phrase without punctuation',
       () => {
         expect(getPhraseStats('hello world')).toEqual({
           charLength: 11,
           numWords: 2,
           numPunctuation: 0,
         });
       });

    it('returns correct value for multi-word phrase with punctuation', () => {
      expect(getPhraseStats('hello, world!')).toEqual({
        charLength: 13,
        numWords: 2,
        numPunctuation: 2,
      });
    });

    it('returns correct value for multi-line phrase with punctuation', () => {
      expect(getPhraseStats('hello, world!\nwe are all one.')).toEqual({
        charLength: 29,
        numWords: 6,
        numPunctuation: 3,
      });
    });
  });

  describe('getContextualPhraseStats', () => {
    it('returns correct value with tags', () => {
      const phrase: ContextualPhrase = {
        text: 'Good morning!',
        phraseId: 'abcd0123',
        tags: ['temporal'],
      };
      expect(getContextualPhraseStats(phrase)).toEqual({
        charLength: 13,
        numWords: 2,
        numPunctuation: 1,
        tags: ['temporal'],
      });
    });
  });

  describe('getAbbreviationExpansionRequestStats', () => {
    it('returns correct value of no-keyword abbreviation', () => {
      const abbrevSpec: AbbreviationSpec = {
        tokens: [{value: 'abcd,e', isKeyword: false}],
        readableString: 'abcd,e',
        lineageId: createUuid(),
      };
      const stats =
          getAbbreviationExpansionRequestStats(abbrevSpec, ['How are you']);
      expect(stats).toEqual({
        abbreviationLength: 6,
        numKeywords: 0,
        numPunctuation: 1,
        contextTurnStats: [{
          charLength: 11,
          numWords: 3,
          numPunctuation: 0,
        }]
      })
    });

    it('returns correct value of 1-keyword abbreviation', () => {
      const abbrevSpec: AbbreviationSpec = {
        tokens: [
          {value: 'abcde', isKeyword: false}, {value: 'again', isKeyword: true}
        ],
        readableString: 'abcd again',
        lineageId: createUuid(),
      };
      const stats = getAbbreviationExpansionRequestStats(abbrevSpec, []);
      expect(stats).toEqual({
        abbreviationLength: 10,
        numKeywords: 1,
        numPunctuation: 0,
        contextTurnStats: []
      })
    });
  });

  describe('getAbbreviationExpansionResponseStats', () => {
    it('returns correct value for 2 options, no error', () => {
      const stats = getAbbreviationExpansionResponseStats(['hi', 'how are you?'])
      expect(stats).toEqual({
        phraseStats: [{
          charLength: 2,
          numWords: 1,
          numPunctuation: 0,
        }, {
          charLength: 12,
          numWords: 3,
          numPunctuation: 1,
        }],
        errorMessage: undefined,
      })
    });

    it('returns correct value for error', () => {
      const stats = getAbbreviationExpansionResponseStats(undefined, 'foo error')
      expect(stats).toEqual({
        errorMessage: 'foo error',
      })
    });
  });
});
