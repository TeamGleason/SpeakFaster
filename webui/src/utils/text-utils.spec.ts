/** Test utils for text-utils. */

import {keySequenceEndsWith, limitStringLength} from './text-utils';

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
});
