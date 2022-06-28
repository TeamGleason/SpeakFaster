/** Implementation of event logger. */

import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, of, throwError} from 'rxjs';
import {concatMap, delay, first, retryWhen} from 'rxjs/operators';
import {isTextContentKey} from 'src/utils/keyboard-utils';
import {createUuid} from 'src/utils/uuid';

import {getVirtualkeyCode} from '../external/external-events.component';
import {AbbreviationSpec} from '../types/abbreviation';
import {AppState, getAppState} from '../types/app-state';
import {ContextualPhrase} from '../types/contextual_phrase';

import {AbbreviationExpansionRequestStats, AbbreviationExpansionResponseStats, ContextualPhraseStats, EventLogger, PhraseStats, RemoteCommandStats, SettingName, TextSelectionType, UserFeedback} from './event-logger';

const EVENT_LOGS_ENDPOINT = '/event_logs';
const PUNCTUATION_REGEX = /^[,\.\!\?\-\;\(\)\[\]\{\}]$/;

export type EventName =
    'AbbreviationExpansionRequest'|'AbbreviationExpansionModeAbort'|
    'AbbreviationExpansionResponse'|'AbbreviationExpansionSelection'|
    'AbbreviationExpansionSpellingChipSelection'|
    'AbbreviationExpansionStartSpellingMode'|
    'AbbreviationExpansionEnterStartWordRefinmentMode'|
    'AbbreviationExpansionWordRefinementRequest'|
    'AbbreviationExpansionWordRefinementResponse'|
    'AbbreviationExpansionWordRefinementSelection'|'AppStateChange'|
    'ContextualPhraseAdd'|'ContextualPhraseAddError'|'ContextualPhraseDelete'|
    'ContextualPhraseDeleteError'|'ContextualPhraseEdit'|
    'ContextualPhraseEditError'|'ContextualPhraseSelection'|
    'ContextualPhraseCopying'|'IncomingContextualTurn'|
    'InputBarInjectButtonClick'|'InputBarSpeakButtonClick'|'Keypress'|
    'SessionEnd'|'SessionStart'|'SettingsChange'|'TextPredictionSelection'|
    'UserFeedback'|'RemoteCommand';

export type EventLogEntry = {
  userId: string;
  // Timestamp in milliseconds since the epoch, in UTC.
  timestamp: number;
  timezone: string;
  sessionId: string;
  eventName: EventName;
  eventData?: Object;
  appState?: AppState;
}

export interface EventLogResponse {
  errorMessage?: string;
}

/**
 * Format / escape a text string for logging. Special characters such as single
 * and double quotes and newline characters are escaped to prevent a class of
 * issues during server-side string parsing.
 */
export function formatTextForLogging(text: string): string {
  // NOTE: `encodeURIComponent()` doesn't escape single quote.
  return encodeURIComponent(text).replace(/'/g, '%27');
}

export function getPhraseStats(phrase: string): PhraseStats {
  const charLength = phrase.length;
  const words = phrase.split(/\s/).filter(word => word.length > 0);
  const numWords = words.length;
  const numPunctuation =
      phrase.split('').filter(char => char.match(PUNCTUATION_REGEX)).length;
  const output: PhraseStats = {charLength, numWords, numPunctuation};
  if (HttpEventLogger.isFullLogging()) {
    output.phrase = formatTextForLogging(phrase);
  }
  return output;
}

export function getAbbreviationExpansionRequestStats(
    spec: AbbreviationSpec,
    contextTurns: string[]): AbbreviationExpansionRequestStats {
  const abbreviationLength = spec.readableString.length;
  let numKeywords = 0;
  spec.tokens.forEach(token => {
    if (token.isKeyword) {
      numKeywords++;
    }
  });
  const numPunctuation = spec.readableString.split('')
                             .filter(char => char.match(PUNCTUATION_REGEX))
                             .length;
  const contextTurnStats = contextTurns.map(turn => getPhraseStats(turn));
  return {abbreviationLength, numKeywords, numPunctuation, contextTurnStats};
}

export function getAbbreviationExpansionResponseStats(
    options?: string[],
    errorMessage?: string): AbbreviationExpansionResponseStats {
  if (options) {
    const output: AbbreviationExpansionResponseStats = {
      phraseStats: options.map(option => getPhraseStats(option)),
      errorMessage,
    };
    if (HttpEventLogger.isFullLogging()) {
      output.phrases = options.map(option => formatTextForLogging(option))
    }
    return output;
  } else {
    return {errorMessage};
  }
}

export function getContextualPhraseStats(phrase: ContextualPhrase):
    ContextualPhraseStats {
  const output: ContextualPhraseStats = {
    ...getPhraseStats(phrase.text),
    tags: phrase.tags,
  };
  if (HttpEventLogger.isFullLogging()) {
    output.phrase = formatTextForLogging(phrase.text);
  }
  return output;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MILLIS = 1000;

@Injectable({
  providedIn: 'root',
})
export class HttpEventLogger implements EventLogger {
  private readonly _sessionId = createUuid();
  private _userId?: string;
  private readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  private static _fullLogging: boolean = false;

  /**
   * Sets logging mode to full.
   *
   * By default, the logging mode is *not* full, which means non-function keys
   * (a-z, 0-9) are not logged and the content of the phrases are not logged.
   * But if this is set to `True`, then the non-function keys and the content
   * of the phrases will be logged as well.
   */
  public static setFullLogging(fullLogging: boolean) {
    if (HttpEventLogger._fullLogging === fullLogging) {
      return;
    }
    HttpEventLogger._fullLogging = fullLogging;
    console.log(`Set full logging to ${HttpEventLogger.isFullLogging()}`);
  }

  public static isFullLogging(): boolean {
    return HttpEventLogger._fullLogging;
  }

  // null value is for testing only.
  constructor(private http: HttpClient|null) {};

  setUserId(userId: string) {
    if (userId.length === 0) {
      throw new Error('User ID is empty.')
    }
    this._userId = userId;
  }

  get userId(): string {
    this.ensureUserIdSet();
    return this._userId!;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  private ensureUserIdSet() {
    if (!this._userId) {
      throw new Error('Cannot log event: user ID is not set');
    }
  }

  private getUtcEpochMillis(): number {
    return Date.parse(new Date().toISOString());
  }

  async logSessionStart() {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'SessionStart',
        })
        .pipe(first())
        .toPromise();
  }

  async logSessionEnd() {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'SessionEnd',
        })
        .pipe(first())
        .toPromise();
  }

  async logCompanionSessionStart() {
    throw new Error('Not implemented');
  }

  async logCompanionSessionEnd() {
    throw new Error('Not implemented');
  }

  async logAppStageChange(oldState: AppState, newState: AppState) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AppStateChange',
          eventData: {oldState, newState},
        })
        .pipe(first())
        .toPromise();
  }

  async logKeypress(keyboardEvent: KeyboardEvent, text: string|null) {
    // Log the content of only special keys under the non-full-logging mode.
    const vkCode =
        (isTextContentKey(keyboardEvent) && !HttpEventLogger.isFullLogging()) ?
        null :
        getVirtualkeyCode(keyboardEvent.key);
    if (!HttpEventLogger.isFullLogging()) {
      text = null;
    } else if (text !== null) {
      text = formatTextForLogging(text);
    }
    // TODO(cais): Add unit test.
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'Keypress',
          eventData: {vkCode, text},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logInputBarSpeakButtonClick(phraseStats: PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'InputBarSpeakButtonClick',
          eventData: {phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logInputBarInjectButtonClick(phraseStats: PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'InputBarInjectButtonClick',
          eventData: {phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseSelection(
      contextualPhraseStats: ContextualPhraseStats,
      textSelectionType: TextSelectionType) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseSelection',
          eventData: {contextualPhraseStats, textSelectionType},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseAdd(contextualPhraseStats: ContextualPhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseAdd',
          eventData: {contextualPhraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseAddError(errorMessage: string) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseAddError',
          eventData: {errorMessage},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseDelete(phraseStats: PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseDelete',
          eventData: {contextualPhraseStats: phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseDeleteError(errorMessage: string) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseDeleteError',
          eventData: {errorMessage},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseEdit(phraseStats: PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseEdit',
          eventData: {contextualPhraseStats: phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseEditError(errorMessage: string) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseEditError',
          eventData: {errorMessage},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionRequest(stats:
                                            AbbreviationExpansionRequestStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionRequest',
          eventData: {stats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionResponse(
      stats: AbbreviationExpansionResponseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionResponse',
          eventData: {stats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionSelection(
      phraseStats: PhraseStats, index: number, numOptions: number,
      textSelectionType: TextSelectionType) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionSelection',
          eventData: {phraseStats, index, numOptions, textSelectionType},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionStartWordRefinementMode(phraseStats:
                                                            PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionEnterStartWordRefinmentMode',
          eventData: {phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logContextualPhraseCopying(phraseStats: ContextualPhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'ContextualPhraseCopying',
          eventData: {phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviatonExpansionWordRefinementRequest(
      phraseStats: PhraseStats, wordIndex: number) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionWordRefinementRequest',
          eventData: {phraseStats, wordIndex},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionWordRefinemenResponse(
      stats: AbbreviationExpansionResponseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionWordRefinementResponse',
          eventData: {stats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionWordRefinementSelection(
      wordLength: number, wordIndex: number) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionWordRefinementSelection',
          eventData: {wordLength, wordIndex},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionStartSpellingMode(abbreviationLength: number) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionStartSpellingMode',
          eventData: {abbreviationLength},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionSpellingChipSelection(
      abbreviationLength: number, wordIndex: number) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionSpellingChipSelection',
          eventData: {abbreviationLength, wordIndex},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logTextPredictionSelection(
      phraseStats: PhraseStats, phraseIndex: number): Promise<void> {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'TextPredictionSelection',
          eventData: {phraseStats, phraseIndex},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionModeAbort() {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionModeAbort',
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logIncomingContextualTurn(phraseStats: PhraseStats) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'IncomingContextualTurn',
          eventData: {phraseStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logOutgoingContextualTurn(phraseStats: PhraseStats) {
    throw new Error('Not implemented');
  }

  async logSettingsChange(settingName: SettingName) {
    this.ensureUserIdSet();
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'SettingsChange',
          eventData: {settingName},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logUserFeedback(userFeedback: UserFeedback) {
    this.ensureUserIdSet();
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'UserFeedback',
          eventData: {userFeedback},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logRemoteCommand(commandStats: RemoteCommandStats) {
    this.ensureUserIdSet();
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'RemoteCommand',
          eventData: {commandStats},
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  private logEvent(eventLogEntry: EventLogEntry): Observable<EventLogResponse> {
    if (window.location.href.startsWith('http://localhost')) {
      return of({});
    }
    if (!this.http) {
      return of({});
    }
    this.ensureUserIdSet();
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
      }),
    };
    return this.http
        .post<EventLogResponse>(
            EVENT_LOGS_ENDPOINT, JSON.stringify(eventLogEntry), httpOptions)
        .pipe(retryWhen(
            error => error.pipe(
                concatMap((error, count) => {
                  if (count < MAX_RETRIES) {
                    return of(error);
                  }
                  return throwError(error);
                }),
                delay(RETRY_DELAY_MILLIS))));
  }
}
