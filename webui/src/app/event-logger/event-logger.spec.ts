/** Unit tests for event-logger-impl. */

import {createUuid} from 'src/utils/uuid';

import {AbbreviationSpec} from '../types/abbreviation';
import {ContextualPhrase} from '../types/contextual_phrase';

import {formatTextForLogging, getAbbreviationExpansionRequestStats, getAbbreviationExpansionResponseStats, getContextualPhraseStats, getPhraseStats, HttpEventLogger} from './event-logger-impl';

describe('EventLogger', () => {
  describe('formatTextForLogging', () => {
    it('Escapes single and double quotes', () => {
      expect(formatTextForLogging('I\'m not saying \"you can\'t do it\"'))
          .toEqual('I%27m%20not%20saying%20%22you%20can%27t%20do%20it%22');
    });

    it('Escapes newline character', () => {
      expect(formatTextForLogging('Don\'t do it\nPlease\n'))
      .toEqual('Don%27t%20do%20it%0APlease%0A');
    });
  });

  describe('isFullLogging()', () => {
    afterEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

    it('is false by default', () => {
      expect(HttpEventLogger.isFullLogging()).toBeFalse();
    });

    it('getter reflects setter change', () => {
      HttpEventLogger.setFullLogging(true);
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
    });
  });

  describe('getPhraseStats', () => {
    beforeEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

    afterEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

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

    it('includes URI-encoded phrase under full logging mode', () => {
      HttpEventLogger.setFullLogging(true);
      expect(getPhraseStats('hello')).toEqual({
        charLength: 5,
        numWords: 1,
        numPunctuation: 0,
        phrase: 'hello',
      });
    });
  });

  describe('getContextualPhraseStats', () => {
    beforeEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

    afterEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

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

    it('includes phrase text under full logging mode', () => {
      HttpEventLogger.setFullLogging(true);
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
        phrase: 'Good%20morning!',
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
    beforeEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

    afterEach(() => {
      HttpEventLogger.setFullLogging(false);
    });

    it('returns correct value for 2 options, no error', () => {
      const stats =
          getAbbreviationExpansionResponseStats(['hi', 'how are you?'])
      expect(stats).toEqual({
        phraseStats: [
          {
            charLength: 2,
            numWords: 1,
            numPunctuation: 0,
          },
          {
            charLength: 12,
            numWords: 3,
            numPunctuation: 1,
          }
        ],
        errorMessage: undefined,
      });
    });

    it('returns correct value for error', () => {
      const stats =
          getAbbreviationExpansionResponseStats(undefined, 'foo error')
      expect(stats).toEqual({
        errorMessage: 'foo error',
      });
    });

    it('includes phrases under full logging mode', () => {
      HttpEventLogger.setFullLogging(true);
      const stats =
          getAbbreviationExpansionResponseStats(['hi', 'how are you?'])
      expect(stats).toEqual({
        phraseStats: [
          {
            charLength: 2,
            numWords: 1,
            numPunctuation: 0,
            phrase: 'hi',
          },
          {
            charLength: 12,
            numWords: 3,
            numPunctuation: 1,
            phrase: 'how%20are%20you%3F',
          }
        ],
        errorMessage: undefined,
        phrases: ['hi', 'how%20are%20you%3F'],
      });
    });
  });
});
