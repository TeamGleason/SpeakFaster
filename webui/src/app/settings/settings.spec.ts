/** Unit tests for settings. */
import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';

import {clearSettings, ensureAppSettingsLoaded, getAppSettings, LOCAL_STORAGE_ITEM_NAME, modifyAppSettingsForTest, setDwellDelayMillis, setEnableAbbrevExpansionAutoFire, setEnableInckw, setGazeFuzzyRadius, setGenericTtsVoiceName as setGenericTtsVoiceName, setNumWordSuggestions, setShowGazeTracker, setTtsSpeakingRate, setTtsVoiceType, setTtsVolume, tryLoadSettings, trySaveSettings} from './settings';

describe('settings', () => {
  beforeEach(async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    clearSettings();
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
  });

  it('loadSettings loads null', async () => {
    (window as any)[BOUND_LISTENER_NAME] = undefined;
    const settings = await tryLoadSettings();
    expect(settings).toBeNull();
  });

  it('ensureAppSettingsLoaded followed by loading loads default value',
     async () => {
       await ensureAppSettingsLoaded();
       const settings = await tryLoadSettings();
       expect(settings).not.toBeNull();
       expect(settings!.ttsVoiceType).toEqual('GENERIC');
       expect(settings!.ttsVolume).toEqual('MEDIUM');
       expect(settings!.showGazeTracker).toEqual('YES');
       expect(settings!.gazeFuzzyRadius).toEqual(20);
       expect(settings!.dwellDelayMillis).toEqual(400);
       expect(settings!.numWordSuggestions).toEqual(4);
       expect(settings!.enableInckw).toBeFalse();
     });

  it('ensureAppSettingsLoaded updates missing fields', async () => {
    modifyAppSettingsForTest({
      ttsVoiceType: 'PERSONALIZED',
      ttsVolume: 'MEDIUM_LOUD',
    });
    await ensureAppSettingsLoaded();
    const settings = await getAppSettings();

    expect(settings!.ttsVoiceType).toEqual('PERSONALIZED');
    expect(settings!.ttsVolume).toEqual('MEDIUM_LOUD');
    expect(settings!.showGazeTracker).toEqual('YES');
    expect(settings!.gazeFuzzyRadius).toEqual(20);
  });

  it('setting tts voice type succeeds', async () => {
    await setTtsVoiceType('GENERIC');
    const settings = await tryLoadSettings();
    expect(settings).not.toBeNull();
    expect(settings!.ttsVoiceType).toEqual('GENERIC');
    expect(settings!.ttsVolume).toEqual('MEDIUM');
  });

  it('setting tts volume succeeds', async () => {
    await setTtsVolume('QUIET');
    const settings = await tryLoadSettings();
    expect(settings).not.toBeNull();
    expect(settings!.ttsVoiceType).toEqual('GENERIC');
    expect(settings!.ttsVolume).toEqual('QUIET');
  });

  it('setting tts speaking rate succeeds', async () => {
    await setTtsSpeakingRate(0.8);
    const settings = await tryLoadSettings();
    expect(settings).not.toBeNull();
    expect(settings!.ttsSpeakingRate).toEqual(0.8);
  });

  it('setting tts speaking rate to invalid value raises error', async () => {
    await expectAsync(setTtsSpeakingRate(-1)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(0)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(0.1)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(10)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(Infinity)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(-Infinity)).toBeRejectedWithError();
    await expectAsync(setTtsSpeakingRate(NaN)).toBeRejectedWithError();
  });

  it('Generic TTS voice name is undefined by default', async () => {
    expect((await getAppSettings()).genericTtsVoiceName).toBeUndefined();
  });

  it('Setting generic TTS voice name to non-undefined works', async () => {
    await setGenericTtsVoiceName('Foo TTS Voice');
    expect((await getAppSettings()).genericTtsVoiceName)
        .toEqual('Foo TTS Voice');
  });

  it('Setting generic TTS voice name back to undefined works', async () => {
    await setGenericTtsVoiceName('Foo TTS Voice');
    await setGenericTtsVoiceName(undefined);
    expect((await getAppSettings()).genericTtsVoiceName).toBeUndefined();
  });

  it('setting showGazeTrakcer succeeds', async () => {
    await setShowGazeTracker('NO');
    await trySaveSettings();
    const settings = await tryLoadSettings();
    expect(settings).not.toBeNull();
    expect(settings!.showGazeTracker).toEqual('NO');
  });

  for (const radius of [0, 30]) {
    it(`setting setGazeFuzzyRadius succeeds: radius=${radius}`, async () => {
      await setGazeFuzzyRadius(radius);
      await trySaveSettings();
      const settings = await tryLoadSettings();
      expect(settings).not.toBeNull();
      expect(settings!.gazeFuzzyRadius).toEqual(radius);
    });
  }

  it('setting gaze fuzzy radius to invalid values raises error', async () => {
    await expectAsync(setGazeFuzzyRadius(-10)).toBeRejectedWithError();
    await expectAsync(setGazeFuzzyRadius(NaN)).toBeRejectedWithError();
    await expectAsync(setGazeFuzzyRadius(Infinity)).toBeRejectedWithError();
  });

  for (const dwellDelayMillis of [300, 500]) {
    it(`setting dwell time millis succeeds: dwellDelayMillis=${
           dwellDelayMillis}`,
       async () => {
         await setDwellDelayMillis(dwellDelayMillis);
         await trySaveSettings();
         const settings = await tryLoadSettings();
         expect(settings).not.toBeNull();
         expect(settings!.dwellDelayMillis).toEqual(dwellDelayMillis);
       });
  }

  it('setting dwell time to invalid values raises error', async () => {
    await expectAsync(setDwellDelayMillis(-10)).toBeRejectedWithError();
    await expectAsync(setDwellDelayMillis(NaN)).toBeRejectedWithError();
    await expectAsync(setDwellDelayMillis(Infinity)).toBeRejectedWithError();
  });

  it('setting number of word suggestions works', async () => {
    await setNumWordSuggestions(5);
    const settings = await tryLoadSettings();
    expect(settings?.numWordSuggestions).toEqual(5);
  });

  it('setting enableInckw works', async () => {
    await setEnableInckw(true);
    const settings = await tryLoadSettings();
    expect(settings?.enableInckw).toBeTrue();
  });

  it('setting enableAbbrevExpansionAutoFire works', async () => {
    await setEnableAbbrevExpansionAutoFire(true);
    const settings = await tryLoadSettings();
    expect(settings?.enableAbbrevExpansionAutoFire).toBeTrue();
  });
});
