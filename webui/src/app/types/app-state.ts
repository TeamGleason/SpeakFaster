/** Types related to applicaton state. */

export enum AppState {
  // Minimized as a mini-bar.
  MINIBAR = 'MINIBAR',
  // Quick phrases: favorite.
  QUICK_PHRASES_FAVORITE = 'QUICK_PHRASES_FAVORITE',
  // Quick phrases: partners.
  QUICK_PHRASES_PARTNERS = 'QUICK_PHRASES_PARTNERS',
  // Quick phrases: care.
  QUICK_PHRASES_CARE = 'QUICK_PHRASES_CARE',
  // Performing abbreviation expansion. Includes temporal quick phrase when
  // there is no context turn.
  ABBREVIATION_EXPANSION = 'ABBREVIATION_EXPANSION',

  // The Settings page: with frequently changed settings such as TTS voice and
  // volume.
  SETTINGS = 'SETTINGS',
  // The eye-gaze settings page.
  EYE_GAZE_SETTINGS = 'EYE_GAZE_SETTINGS',
  // The help page.
  HELP = 'HELP',
}
