/** Unit tests for app state. */

import {AppState, getAppState, getPreviousNonMinimizedAppState, getQuickPhraseSubTag, resetStatesForTest, setAppState, setQuickPhrasesSubTag} from './app-state';

describe('appState', () => {
  afterEach(async () => {
    resetStatesForTest();
  });

  it('initial app state is abbreviation expansion', () => {
    expect(getAppState()).toEqual(AppState.ABBREVIATION_EXPANSION);
  });

  it('initial nonminimized state is abbreviation expansion', () => {
    expect(getPreviousNonMinimizedAppState())
        .toEqual(AppState.ABBREVIATION_EXPANSION);
  });

  it('initial quick-phrases sub tag is null', () => {
    expect(getQuickPhraseSubTag()).toBeNull();
  });

  it('changing state from default to minimized works', () => {
    setAppState(AppState.MINIBAR);

    expect(getAppState()).toEqual(AppState.MINIBAR);
    expect(getPreviousNonMinimizedAppState())
        .toEqual(AppState.ABBREVIATION_EXPANSION);
    expect(getQuickPhraseSubTag()).toBeNull();
  });

  it('changing state from non-default to minized works', () => {
    setAppState(AppState.SETTINGS);
    setQuickPhrasesSubTag('Foo');
    setAppState(AppState.MINIBAR);

    expect(getAppState()).toEqual(AppState.MINIBAR);
    expect(getPreviousNonMinimizedAppState()).toEqual(AppState.SETTINGS);
    expect(getQuickPhraseSubTag()).toEqual('Foo');
  });

  it('changing quick-phrases sub tag works', () => {
    setQuickPhrasesSubTag('Foo');
    expect(getQuickPhraseSubTag()).toEqual('Foo');
    setQuickPhrasesSubTag(null);
    expect(getQuickPhraseSubTag()).toBeNull();
  });
});
