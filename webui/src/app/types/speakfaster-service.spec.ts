import {maybeStripJsonField} from '../speakfaster-service';

describe('SpeakFaster service', () => {
  it('maybeStripJsonField strips json: string value', () => {
    expect(maybeStripJsonField({
      json: JSON.stringify({pingResponse: 'okay'})
    })).toEqual({pingResponse: 'okay'});
  });

  it('maybeStripJsonField strips json: object value', () => {
    expect(maybeStripJsonField({json: {pingResponse: 'okay'}})).toEqual({
      pingResponse: 'okay'
    });
  });

  it('maybeStripJsonField: works for no-json case', () => {
    expect(maybeStripJsonField({pingResponse: 'okay'})).toEqual({
      pingResponse: 'okay'
    });
  });
});
