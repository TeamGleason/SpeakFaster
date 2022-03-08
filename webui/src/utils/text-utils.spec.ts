/** Test utils for text-utils. */

import {keySequenceEndsWith, limitStringLength, trimStringAtHead} from './text-utils';

fdescribe('text-utils', () => {
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
});
