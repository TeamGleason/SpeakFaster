/** Abstract interface and related type definitions for app usage logging. */

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

  // Optional full content of the phrase. Logged only under the full-
  // logging mode.
  phrase?: string;
}

export interface ContextualPhraseStats extends PhraseStats {
  // Tags attached to the quick phrase.
  tags?: string[];
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

  // Optional full content of the phrases. Logged only under the full-
  // logging mode.
  phrases?: string[];

  // Error message (if any);
  errorMessage?: string;
}

// Name of an app setting.
export type SettingName =
    'TtsVoiceType'|'TtsVolume'|'TtsSpeakingRate'|'ShowGazeTracker'|
    'GazeFuzzyRadius'|'DwellDelayMillis'|'NumWordSuggestions'|'EnableInckw'|
    'EnableAbbrevExpansionAutoFire';

export interface UserFeedback {
  // The feedback message that the user typed.
  feedbackMessage: string;
}

export interface RemoteCommandStats {
  command: string;
}

export interface EventLogger {
  /** Log the starting of a new (non-companion) session (opening the app). */
  logSessionStart(): Promise<void>;

  /** Log the ending of a (non-companion) session (quittng the app). */
  logSessionEnd(): Promise<void>;

  /** Log the starting of a new session (opening the app). */
  logCompanionSessionStart(): Promise<void>;

  /** Log the ending of a session (quittng the app). */
  logCompanionSessionEnd(): Promise<void>;

  /** Log app state change (e.g., switching to a new tab, or going into the */
  logAppStageChange(oldState: AppState, newState: AppState): Promise<void>;

  /**
   * Log a keypress. The text content keys will not be logged for their content
   * (e.g, alphanumeric keys and puncutation keys). Only special keys such as
   * Enter, Space, Backspace, Ctrl and Shift will be logged for their content.
   * The argument `text` is for the mobile use cases, where the key code is not
   * available from a `KeyboardEvent`.
   */
  logKeypress(keyboardEvent: KeyboardEvent, text: string): Promise<void>;

  /** Log the clicking of the speak button in the input bar. */
  logInputBarSpeakButtonClick(phraseStats: PhraseStats): Promise<void>;

  /** Log the clicking of the inject button in the input bar. */
  logInputBarInjectButtonClick(phraseStats: PhraseStats): Promise<void>;

  /**
   * Log the selection of a quick phrase for output.
   * @param contextualPhraseStats
   * @param textSelectionType Type of text selection.
   */
  logContextualPhraseSelection(
      contextualPhraseStats: ContextualPhraseStats,
      textSelectionType: TextSelectionType): Promise<void>;


  /**
   * Log the copying of a contextual phrase into the input bar for further
   * editing.
   */
  logContextualPhraseCopying(contextualPhraseStats: ContextualPhraseStats):
      Promise<void>;

  /** Log the addition of a quick phrase. */
  logContextualPhraseAdd(contextualPhraseStats: ContextualPhraseStats):
      Promise<void>;

  /** Log an error in handling add-quick-phrase request. */
  logContextualPhraseAddError(errorMessage: string): Promise<void>;

  /** Log the deletion of a quick phrase. */
  logContextualPhraseDelete(phraseStats: PhraseStats): Promise<void>;

  /** Log an error in handling delete-quick-phrase request. */
  logContextualPhraseDeleteError(errorMessage: string): Promise<void>;

  /** Log the editing of a quick phrase */
  logContextualPhraseEdit(contextualPhraseStats: ContextualPhraseStats):
      Promise<void>;

  /** Log an error in handling an edit-quick-phrase request. */
  logContextualPhraseEditError(errorMessage: string): Promise<void>;

  /** Log abbreviation expansion request. */
  logAbbreviationExpansionRequest(stats: AbbreviationExpansionRequestStats):
      Promise<void>;

  /** Log abbreviation expansion response. */
  logAbbreviationExpansionResponse(stats: AbbreviationExpansionResponseStats):
      Promise<void>;

  /**
   * Log selection of abbreviation expansion option.
   * @param phraseStats Statistics about the selected phrase.
   * @param index 0-based index for the selected phrase among all options.
   * @param numOptions How many options were provided in total.
   * @param textSelectionType Whether the selection is for TTS or injection.
   */
  logAbbreviationExpansionSelection(
      phraseStats: PhraseStats, index: number, numOptions: number,
      textSelectionType: TextSelectionType): Promise<void>;

  /** Log entering word-refinement mode for abbreviation expansion. */
  logAbbreviationExpansionStartWordRefinementMode(phraseStats: PhraseStats):
      Promise<void>;

  /** Log a word refinement request for abbreviation expansion. */
  logAbbreviatonExpansionWordRefinementRequest(
      phraseStats: PhraseStats, wordIndex: number): Promise<void>;

  /** Log a response to a word refinement request for abbreviation expansion. */
  logAbbreviationExpansionWordRefinemenResponse(
      stats: AbbreviationExpansionResponseStats): Promise<void>;

  /**
   * Log the selection of a replacement (refinement) word during
   * abbreviation-expansion word refinement.
   */
  logAbbreviationExpansionWordRefinementSelection(
      wordLength: number, wordIndex: number): Promise<void>;

  /** Log entering spelling mode for abbreviation expansion. */
  logAbbreviationExpansionStartSpellingMode(abbreviationLength: number):
      Promise<void>;

  /**
   * Log the selection of a letter chip for the spelling mode of abbreviation
   * expansion.
   */
  logAbbreviationExpansionSpellingChipSelection(
      abbreviationLength: number, wordIndex: number): Promise<void>;

  /**
   * Log the selection of a text prediction, most typically a word completion
   * or next-word prediction. Note that this is different from contextual-phrase
   * selections.
   */
  logTextPredictionSelection(phraseStats: PhraseStats, phraseIndex: number):
      Promise<void>;

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

  /** Log user feedback. */
  logUserFeedback(userFeedback: UserFeedback): Promise<void>;

  /** Log remote command. */
  logRemoteCommand(commandStats: RemoteCommandStats): Promise<void>;
}
