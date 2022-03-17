/** Unit tests for version.ts. */

import {VERSION} from './version';

describe('version', () => {
  it('VERSION string matches semver format', () => {
    expect(typeof VERSION).toEqual('string');
    expect(VERSION).toMatch(/[0-9]+\.[0-9]+\.[0-9]+/);
  });

});
