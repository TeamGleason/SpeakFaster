/** Test utils for text-utils. */

import {limitStringLength} from './text-utils';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
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
});
