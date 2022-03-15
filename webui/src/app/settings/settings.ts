/** Data types and logic related to app settings. */

import {VERSION} from '@angular/core';
import {ObjectUnsubscribedError} from 'rxjs';
import {loadSettings, saveSettings} from 'src/utils/cefsharp';

export type TtsVoiceType = 'PERSONALIZED'|'GENERIC';

export type TtsVolume = 'QUIET'|'MEDIUM_QUIET'|'MEDIUM'|'MEDIUM_LOUD'|'LOUD';

export type ShowGazeTracker = 'YES'|'NO';

export const DEFAULT_GAZE_FUZZY_RADIUS = 20;

export const LOCAL_STORAGE_ITEM_NAME = 'GoogleSpeakFasterWebUiSettings.json';

export interface AppSettings {
  ttsVoiceType: TtsVoiceType;

  ttsVolume: TtsVolume;

  // Whether the dot that indicates the current gaze location is shown.
  showGazeTracker?: ShowGazeTracker;

  // The radius of the fuzziness for matching gaze point to clickable items on
  // the screen.
  gazeFuzzyRadius?: number;
}

let appSettings: AppSettings|null = null;

export function getDefaultAppSettings(): AppSettings {
  return {
    ttsVoiceType: 'GENERIC',
    ttsVolume: 'MEDIUM',
    showGazeTracker: 'YES',
    gazeFuzzyRadius: DEFAULT_GAZE_FUZZY_RADIUS,
  };
}

export function modifyAppSettingsForTest(settings: AppSettings) {
  appSettings = settings;
}

export async function ensureAppSettingsLoaded(): Promise<void> {
  if (appSettings !== null) {
    addMissingSettingsFields()
    return;
  }
  appSettings = await tryLoadSettings();
  if (appSettings !== null) {
    addMissingSettingsFields();
    return;
  }
  appSettings = getDefaultAppSettings();
  await trySaveSettings();
}

function addMissingSettingsFields() {
  const defaultSettings = getDefaultAppSettings();
  // Add missing fields.
  for (const key in defaultSettings) {
    if ((appSettings as any)[key] === undefined) {
      (appSettings as any)[key] = (defaultSettings as any)[key];
    }
  }
}

/**
 * Try loading settings from possible storage medias.
 * Try multiple medias in the following order:
 * 1. CefSharp host bridge.
 * 2. Browser local storage.
 **/
export async function tryLoadSettings(): Promise<AppSettings|null> {
  const settings: AppSettings|null = await loadSettings();
  if (settings !== null) {
    console.log('Loaded app settings from CefSharp host');
    return settings;
  }
  const serializedSettings: string|null =
      localStorage.getItem(LOCAL_STORAGE_ITEM_NAME);
  if (serializedSettings === null) {
    return null;
  }
  console.log(
      `Loaded app settings from local storage: ${LOCAL_STORAGE_ITEM_NAME}`);
  return JSON.parse(serializedSettings);
}

/**
 * Try saving app settings to storage medias, in the following order:
 * 1. CefSharp host bridge.
 * 2. Browser local storage.
 */
export async function trySaveSettings() {
  const settingsObject = {
    ...await getAppSettings(),
    appVersion: VERSION,
  };
  if (await saveSettings(settingsObject)) {
    console.log('Saved app settings via the CefSharp host bridge.');
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_ITEM_NAME, JSON.stringify(settingsObject));
  console.log(
      `Saved app settings at local storage: ${LOCAL_STORAGE_ITEM_NAME}`);
}

/** Retrieve app settings. */
export async function getAppSettings(): Promise<AppSettings> {
  await ensureAppSettingsLoaded();
  return appSettings!;
}

export async function setTtsVoiceType(ttsVoiceType: TtsVoiceType) {
  await ensureAppSettingsLoaded();
  appSettings!.ttsVoiceType = ttsVoiceType;
  await trySaveSettings();
}

export async function setTtsVolume(ttsVolume: TtsVolume) {
  await ensureAppSettingsLoaded();
  appSettings!.ttsVolume = ttsVolume;
  await trySaveSettings();
}

export async function setShowGazeTracker(showGazeTracker: ShowGazeTracker) {
  await ensureAppSettingsLoaded();
  appSettings!.showGazeTracker = showGazeTracker;
  await trySaveSettings();
}

export async function setGazeFuzzyRadius(radius: number) {
  if (!(radius >= 0 && isFinite(radius))) {
    throw new Error(`Required gaze fuzzy radius to be >= 0, but got ${radius}`);
  }
  await ensureAppSettingsLoaded();
  appSettings!.gazeFuzzyRadius = radius;
  await trySaveSettings();
}

export function clearSettings(): void {
  appSettings = null;
}
