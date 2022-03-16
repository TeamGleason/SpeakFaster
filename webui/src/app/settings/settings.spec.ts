/** Unit tests for settings. */
import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';

import {clearSettings, ensureAppSettingsLoaded, getAppSettings, LOCAL_STORAGE_ITEM_NAME, modifyAppSettingsForTest, setGazeFuzzyRadius, setShowGazeTracker, setTtsSpeakingRate, setTtsVoiceType, setTtsVolume, tryLoadSettings, trySaveSettings} from './settings';

fdescribe('settings', () => {
  beforeEach(async () => {
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

  it('setting showGazeTrakcer succeeds', async () => {
    await setShowGazeTracker('NO');
    await trySaveSettings();
    const settings = await tryLoadSettings();
    expect(settings).not.toBeNull();
    expect(settings!.showGazeTracker).toEqual('NO');
  });

  for (const radius of [0, 30]) {
    it('setting setGazeFuzzyRadius succeeds', async () => {
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

});
