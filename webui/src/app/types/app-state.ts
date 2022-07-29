/** Types and states related to applicaton state. */

export enum AppState {
  // Minimized as a mini-bar.
  MINIBAR = 'MINIBAR',
  // Quick phrases: favorite.
  QUICK_PHRASES_FAVORITE = 'QUICK_PHRASES_FAVORITE',
  // Quick phrases: partners.
  QUICK_PHRASES_PARTNERS = 'QUICK_PHRASES_PARTNERS',
  // Performing abbreviation expansion. Includes temporal quick phrase when
  // there is no context turn.
  ABBREVIATION_EXPANSION = 'ABBREVIATION_EXPANSION',

  // The Settings page: with frequently changed settings such as TTS voice and
  // volume.
  SETTINGS = 'SETTINGS',
  // The eye-gaze settings page.
  EYE_GAZE_SETTINGS = 'EYE_GAZE_SETTINGS',
  // AI settings page: with options related to word suggestions and abbreviation
  // expansions.
  AI_SETTINGS = 'AI_SETTINGS',
  // The help page.
  HELP = 'HELP',
  // Selecting TTS voice.
  TTS_VOICE_SELECTION = 'TTS_VOICE_SELECTION',
}

let appState: AppState = AppState.ABBREVIATION_EXPANSION;
let previousNonMinimizedAppState: AppState = AppState.ABBREVIATION_EXPANSION;
let quickPhrasesSubTag: string|null = null;

/** Sets the current app state. */
export function setAppState(newState: AppState) {
  if (newState === AppState.MINIBAR && appState !== AppState.MINIBAR) {
    previousNonMinimizedAppState = appState;
  }
  appState = newState;
}

/** Gets the current app state. */
export function getAppState(): AppState {
  return appState;
}

/**
 * Gets the memorized, previous non-minimized app state.
 * This can be used to restore from the minimized state.
 */
export function getPreviousNonMinimizedAppState(): AppState {
  return previousNonMinimizedAppState;
}

/** Sets the sub tag for quick phrases ("people phrases"). */
export function setQuickPhrasesSubTag(subTag: string|null) {
  quickPhrasesSubTag = subTag;
}

/** Gets the sub tag for quick phrases. */
export function getQuickPhraseSubTag(): string|null {
  return quickPhrasesSubTag;
}

/** Reset all related state. For testing only. */
export function resetStatesForTest() {
  appState = AppState.ABBREVIATION_EXPANSION;
  previousNonMinimizedAppState = AppState.ABBREVIATION_EXPANSION;
  quickPhrasesSubTag = null;
}
