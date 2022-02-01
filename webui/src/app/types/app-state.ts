/** Types related to applicaton state. */

export enum AppState {
  // Minimized as a mini-bar.
  MINIBAR = 'MINIBAR',
  // Quick phrases: favorite.
  QUICK_PHRASES_FAVORITE = 'QUICK_PHRASES_FAVORITE',
  // Quick phrases: temporal.
  QUICK_PHRASES_TEMPORAL = 'QUICK_PHRASES_TEMPORAL',
  // Quick phrases: partners.
  QUICK_PHRASES_PARTNERS = 'QUICK_PHRASES_PARTNERS',
  // Quick phrases: care.
  QUICK_PHRASES_CARE = 'QUICK_PHRASES_CARE',
  // Expanded in full (i.e., not minimized as a mini-bar).
  ABBREVIATION_EXPANSION = 'ABBREVIATION_EXPANSION',
}
