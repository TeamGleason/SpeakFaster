/** Unit tests for settings. */
import {BOUND_LISTENER_NAME} from '../../utils/cefsharp';

import {clearSettings, ensureAppSettingsLoaded, LOCAL_STORAGE_ITEM_NAME, setTtsVoiceType, setTtsVolume, tryLoadSettings} from './settings';

describe('settings', () => {
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
       expect(settings!.ttsVoiceType).toEqual('PERSONALIZED');
       expect(settings!.ttsVolume).toEqual('MEDIUM');
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
    expect(settings!.ttsVoiceType).toEqual('PERSONALIZED');
    expect(settings!.ttsVolume).toEqual('QUIET');
  });
});
