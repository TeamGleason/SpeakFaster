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

  // The Settings page.
  SETTINGS = 'SETTINGS',
  // The help page.
  HELP = 'HELP',
}
