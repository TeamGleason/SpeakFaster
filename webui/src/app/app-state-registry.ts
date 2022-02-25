/** App state registry. */

import {AppState} from './types/app-state';

let _appState: AppState = AppState.ABBREVIATION_EXPANSION;

export function registerAppState(appState: AppState): void {
  _appState = appState;
}

export function getAppState(): AppState {
  return _appState;
}
