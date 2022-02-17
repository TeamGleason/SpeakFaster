/** Data types and logic related to app settings. */

export type TtsVoiceType = 'PERSONALIZED'|'GENERIC';

export type TtsVolume = 'QUIET'|'MEDIUM'|'LOUD';

export interface AppSettings {
  ttsVoiceType: TtsVoiceType;

  ttsVolume: TtsVolume;
}

const appSettings: AppSettings = {
  ttsVoiceType: 'PERSONALIZED',
  ttsVolume: 'MEDIUM',
};

export function getAppSettings(): AppSettings {
  return appSettings;
}

export function setTtsVoiceType(ttsVoiceType: TtsVoiceType) {
  appSettings.ttsVoiceType = ttsVoiceType;
}

export function setTtsVolume(ttsVolume: TtsVolume) {
  appSettings.ttsVolume = ttsVolume;
}
