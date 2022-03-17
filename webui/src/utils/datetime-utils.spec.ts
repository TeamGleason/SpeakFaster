import {getAgoString} from './datetime-utils';

describe('Datetime utils', () => {
  describe('getAgoString', () => {
    it('returns correct seconds string', () => {
      const t0 = new Date();
      expect(getAgoString(t0, t0)).toEqual('0s');
      expect(getAgoString(t0, new Date(t0.getTime() + 10 * 1e3)))
          .toEqual('10s');
      expect(getAgoString(t0, new Date(t0.getTime() + 59 * 1e3)))
          .toEqual('59s');
    });

    it('returns correct minute string', () => {
      const t0 = new Date();
      expect(getAgoString(t0, new Date(t0.getTime() + 60 * 1e3))).toEqual('1m');
      expect(getAgoString(t0, new Date(t0.getTime() + 89 * 1e3))).toEqual('1m');
      expect(getAgoString(t0, new Date(t0.getTime() + 90 * 1e3))).toEqual('2m');
      expect(getAgoString(t0, new Date(t0.getTime() + 119 * 1e3)))
          .toEqual('2m');
    });
  });
});
