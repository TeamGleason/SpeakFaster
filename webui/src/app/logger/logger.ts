/** Abstract interface and related type definitions for app usage logging. */

import {VIRTUAL_KEY} from '../external/external-events.component';
import {AppState} from '../types/app-state';

// Whether the selected text is for text-to-speech (TTS) output or injection
// into another application.
export type TextSelectionType = 'TTS'|'INJECTION';

export interface PhraseStats {
  // Character length of the quick phrase.
  charLength: number;

  // Number of words in the quick phrase.
  numWords: number;

  // Number of punctuation characters.
  numPunctuation: number;
}

export interface QuickPhraseStats extends PhraseStats {
  // Tags attached to the quick phrase.
  tags: string[];
}

export interface AbbreviationExpansionRequestStats {
  // Length of the readable form of the abbreviation, e.g., "hay", "how ay".
  abbreviationLength: number;

  // Number of keywords in the abbreviation.
  numKeywords: number;

  // Number of punctuation characters in the abbreviation.
  numPunctuation: number;

  // Phrase stats related to the conversation contexts.
  contextTurnStats: PhraseStats[];
}

export interface AbbreviationExpansionResponseStats {
  // Stats of the expansion options.
  phraseStats?: PhraseStats[];

  // Error message (if any);
  errorMessage?: string;
}

// Name of an app setting.
export type SettingName = 'TtsVoiceType'|'TtsVolume';

export interface AppUsageLogger {
  /** Log the starting of a new (non-companion) session (opening the app). */
  logSessionStart(): Promise<void>;

  /** Log the ending of a (non-companion) session (quittng the app). */
  logSessionEnd(): Promise<void>;

  /** Log the starting of a new session (opening the app). */
  logCompanionSessionStart(): Promise<void>;

  /** Log the ending of a session (quittng the app). */
  logCompanionSessionEnd(): Promise<void>;

  /** Log app state change (e.g., switching to a new tab, or going into the */
  logAppStageChange(appState: AppState): Promise<void>;

  /**
   * Log a keypress.
   * @param vkCode must be `null` unless it is VIRTUAL_KEY (e.g., space,
   *     backspace).
   * @param appState: AppState in which this keypress happened.
   */
  logKeypress(vkCode: null|VIRTUAL_KEY, appState: AppState): Promise<void>;

  /**
   * Log the selection of a quick phrase for output.
   * @param quickPhraseLength Character length of the selected quick phrase.
   * @param numWords Number of words in the selected quick phrase.
   * @param textSelectionType Type of text selection.
   * @param appState App state in which the quick-phrase selection happened.
   */
  logQuickPhraseSelection(
      quickPhraseLength: number, numWords: number,
      textSelectionType: TextSelectionType, appState: AppState): Promise<void>;

  /** Log the addition of a quick phrase. */
  logQuickPhraseAdd(quickPhraseStats: QuickPhraseStats, appState: AppState):
      Promise<void>;

  /** Log an error in handling add-quick-phrase request. */
  logQuickPhraseAddError(errorMessage: string, appState: AppState):
      Promise<void>;

  /** Log the deletion of a quick phrase. */
  logQuickPhraseDelete(quickPhraseStats: QuickPhraseStats, appState: AppState):
      Promise<void>;

  /** Log an error in handling delete-quick-phrase request. */
  logQuickPhraseDeleteError(errorMessage: string, appState: AppState):
      Promise<void>;

  /** Log the restoration of a quick phrase after deletion. */
  logQuickPhraseRestore(quickPhraseStats: QuickPhraseStats, appState: AppState):
      Promise<void>;

  /** Log abbreviaton expansion request. */
  logAbbreviationExpansionRequest(stats: AbbreviationExpansionRequestStats):
      Promise<void>;

  /** Log abbreviaton expansion response. */
  logAbbreviatoinExpansionResponse(stats: AbbreviationExpansionResponseStats):
      Promise<void>;

  /** Log selection of abbreviation expansion option. */
  logAbbreviationExpansionSelection(phraseStats: PhraseStats): Promise<void>;

  /** Log entering word-refinement mode for abbreviation expansion. */
  logAbbreviationExpansionStartWordRefinementMode(): Promise<void>;

  /** Log a word refinement request for abbreviation expansion. */
  logAbbreviatonExpansionWordRefinementRequest(
      phraseStats: PhraseStats, wordIndex: number): Promise<void>;

  logAbbreviationExpansionWordRefinemenResponse(
      stats: AbbreviationExpansionResponseStats): Promise<void>;

  /** Log entering spelling mode for abbreviation expansion. */
  logAbbreviationExpansionStartSpellingMode(): Promise<void>;

  /**
   * Log the selection of a letter chip for the spelling mode of abbreviation
   * expansion.
   */
  logAbbreviationExpansionSpellingChipSelectio(
      phraseStats: PhraseStats, wordIndex: number): Promise<void>;

  /**
   * Log the mode abort during abbreviation expansion, e.g., abort from word
   * refinement or from spelling.
   */
  logAbbreviationExpansionModeAbort(): Promise<void>;

  /** Log the arrival of an incoming context turn (from partner). */
  logIncomingContextualTurn(phraseStats: PhraseStats): Promise<void>;

  /** Log the sending of a context turn (from the companion mode). */
  logOutgoingContextualTurn(phraseStats: PhraseStats): Promise<void>;

  /** Log settings change. */
  logSettingsChange(settingName: SettingName): Promise<void>;
}
