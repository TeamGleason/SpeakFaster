/** Test utils for text-utils. */

import {endsWithPunctuation, extractEndPunctuation, keySequenceEndsWith, limitStringLength, removePunctuation, trimStringAtHead} from './text-utils';

describe('text-utils', () => {
  describe('limitStringLength', () => {
    it('preserves short input strings', () => {
      expect(limitStringLength('', 10)).toEqual('');
      expect(limitStringLength('  hi  ', 10)).toEqual('  hi  ');
    });

    it('head truncation for long input strings', () => {
      expect(limitStringLength('hello world', 6)).toEqual('world');
    });
  });

  describe('keySequenceEndsWith', () => {
    it('returns true for true suffix', () => {
      expect(keySequenceEndsWith(['a', 'b', 'c'], ['b', 'c'])).toEqual(true);
    });

    it('returns false for non-suffix', () => {
      expect(keySequenceEndsWith(['a', 'b', 'c'], ['b', 'a'])).toEqual(false);
    });
  });

  describe('trimStringAtHead', () => {
    it('length <= limit', () => {
      expect(trimStringAtHead('', 8)).toEqual('');
      expect(trimStringAtHead('foo bar', 8)).toEqual('foo bar');
      expect(trimStringAtHead('foo\nbar.', 8)).toEqual('foo\nbar.');
      expect(trimStringAtHead('foo bar', 7)).toEqual('foo bar');
    });

    it('length > limit: no word cutting', () => {
      expect(trimStringAtHead('foo bar qux', 7)).toEqual('bar qux');
      expect(trimStringAtHead('foo\tbar qux', 7)).toEqual('bar qux');
      expect(trimStringAtHead('foo\nbar qux', 7)).toEqual('bar qux');
    });

    it('length > limit: with word cutting', () => {
      expect(trimStringAtHead('foo bar qux', 6)).toEqual('qux');
      expect(trimStringAtHead('foo\tbar qux', 6)).toEqual('qux');
      expect(trimStringAtHead('foo\nbar qux', 6)).toEqual('qux');
    });

    it('edge case: length limit is 0', () => {
      expect(trimStringAtHead('foo bar', 0)).toEqual('');
      expect(trimStringAtHead('foo bar', 0)).toEqual('');
    });
  });

  describe('removePunctuation', () => {
    it('removes punctuation from punctuation-only strings', () => {
      expect(removePunctuation('.')).toEqual('');
      expect(removePunctuation(' !')).toEqual(' ');
      expect(removePunctuation(' ??')).toEqual(' ');
    });

    it('removes punctuation from mixed strings', () => {
      expect(removePunctuation('. hi there!')).toEqual(' hi there');
    });

    it('preserves comma in strings', () => {
      expect(removePunctuation('. hi, there!')).toEqual(' hi, there');
    });

    it('preserves no-punctuation strings', () => {
      expect(removePunctuation('')).toEqual('');
      expect(removePunctuation(' ')).toEqual(' ');
      expect(removePunctuation('hi there')).toEqual('hi there');
    });
  });

  describe('endsWithPunctuation', () => {
    it('returns true', () => {
      expect(endsWithPunctuation('.')).toBeTrue();
      expect(endsWithPunctuation('hi.')).toBeTrue();
      expect(endsWithPunctuation('hi..')).toBeTrue();
      expect(endsWithPunctuation('hi,')).toBeTrue();
      expect(endsWithPunctuation('hi,,')).toBeTrue();
      expect(endsWithPunctuation('wait;')).toBeTrue();
      expect(endsWithPunctuation('hello!')).toBeTrue();
      expect(endsWithPunctuation('hello!!')).toBeTrue();
      expect(endsWithPunctuation('hello?')).toBeTrue();
    });

    it('returns false', () => {
      expect(endsWithPunctuation('')).toBeFalse();
      expect(endsWithPunctuation(' ')).toBeFalse();
      expect(endsWithPunctuation('wait')).toBeFalse();
      expect(endsWithPunctuation('wait; ')).toBeFalse();
    });
  });

  describe('extractEndPunctuation', () => {
    it('returns correct empty string', () => {
      expect(extractEndPunctuation('')).toEqual('');
      expect(extractEndPunctuation('foo')).toEqual('');
      expect(extractEndPunctuation(',foo')).toEqual('');
      expect(extractEndPunctuation(',foo ')).toEqual('');
      expect(extractEndPunctuation('foo-bar-')).toEqual('');
    });

    it('returns correct punctuation', () => {
      expect(extractEndPunctuation(',')).toEqual(',');
      expect(extractEndPunctuation(':,')).toEqual(':,');
      expect(extractEndPunctuation('foo,')).toEqual(',');
      expect(extractEndPunctuation('foo,,')).toEqual(',,');
      expect(extractEndPunctuation('foo;')).toEqual(';');
      expect(extractEndPunctuation('foo:')).toEqual(':');
      expect(extractEndPunctuation('foo...')).toEqual('...');
      expect(extractEndPunctuation('foo!')).toEqual('!');
      expect(extractEndPunctuation('foo?')).toEqual('?');
      expect(extractEndPunctuation('foo!?')).toEqual('!?');
    });
  });
});
