/** Implementation of event logger. */

import {HttpClient, HttpHeaders} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {first} from 'rxjs/operators';
import {isPlainAlphanumericKey, isTextContentKey} from 'src/utils/keyboard-utils';
import {createUuid} from 'src/utils/uuid';

import {getAppState} from '../app-state-registry';
import {getVirtualkeyCode, VIRTUAL_KEY} from '../external/external-events.component';
import {AbbreviationSpec} from '../types/abbreviation';
import {AppState} from '../types/app-state';
import {ContextualPhrase} from '../types/contextual_phrase';

import {AbbreviationExpansionRequestStats, AbbreviationExpansionResponseStats, ContextualPhraseStats, EventLogger, PhraseStats, SettingName, TextSelectionType} from './event-logger';

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
    'ContextualPhraseDeleteError'|'IncomingContextualTurn'|
    'InputBarSpeakButtonClick'|'Keypress'|'SessionEnd'|'SessionStart'|
    'SettingsChange';

export type EventLogEntry = {
  userId: string;
  // Timestamp in milliseconds since the epoch, in UTC.
  timestamp: number;
  timezone: string;
  sessionId: string;
  eventName: EventName;
  eventData?: string;
  appState?: AppState;
}

export interface EventLogResponse {
  errorMessage?: string;
}

export function getPhraseStats(phrase: string): PhraseStats {
  const charLength = phrase.length;
  const words = phrase.split(/\s/).filter(word => word.length > 0);
  const numWords = words.length;
  const numPunctuation =
      phrase.split('').filter(char => char.match(PUNCTUATION_REGEX)).length;
  return {charLength, numWords, numPunctuation};
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
    return {
      phraseStats: options.map(option => getPhraseStats(option)), errorMessage,
    }
  } else {
    return {errorMessage};
  }
}

export function getContextualPhraseStats(phrase: ContextualPhrase):
    ContextualPhraseStats {
  return {
    ...getPhraseStats(phrase.text),
    tags: phrase.tags,
  };
}

@Injectable({
  providedIn: 'root',
})
export class HttpEventLogger implements EventLogger {
  private readonly _sessionId = createUuid();
  private _userId?: string;
  private readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // null value is for testing only.
  constructor(private http: HttpClient|null) {};

  setUserId(userId: string) {
    if (this._userId) {
      throw new Error('Session ID is already set. Cannot set it again');
    }
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
          eventData: JSON.stringify({oldState, newState}),
        })
        .pipe(first())
        .toPromise();
  }

  async logKeypress(keyboardEvent: KeyboardEvent) {
    // Log the content of only special keys.
    const vkCode = isTextContentKey(keyboardEvent) ?
        null :
        getVirtualkeyCode(keyboardEvent.key);
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'Keypress',
          eventData: JSON.stringify({vkCode}),
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
          eventData: JSON.stringify({phraseStats}),
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
          eventName: 'ContextualPhraseAdd',
          eventData: JSON.stringify({contextualPhraseStats, textSelectionType}),
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
          eventData: JSON.stringify({contextualPhraseStats}),
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
          eventData: JSON.stringify({errorMessage}),
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
          eventData: JSON.stringify({contextualPhraseStats: phraseStats}),
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
          eventData: JSON.stringify({errorMessage}),
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
          eventData: JSON.stringify({stats}),
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
          eventData: JSON.stringify({stats}),
          appState: getAppState(),
        })
        .pipe(first())
        .toPromise();
  }

  async logAbbreviationExpansionSelection(
      phraseStats: PhraseStats, textSelectionType: TextSelectionType) {
    await this
        .logEvent({
          userId: this._userId!,
          timestamp: this.getUtcEpochMillis(),
          timezone: this.timezone,
          sessionId: this.sessionId,
          eventName: 'AbbreviationExpansionSelection',
          eventData: JSON.stringify({phraseStats, textSelectionType}),
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
          eventData: JSON.stringify({phraseStats}),
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
          eventData: JSON.stringify({phraseStats, wordIndex}),
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
          eventData: JSON.stringify({stats}),
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
          eventData: JSON.stringify({wordLength, wordIndex}),
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
          eventData: JSON.stringify({abbreviationLength}),
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
          eventData: JSON.stringify({abbreviationLength, wordIndex}),
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
          eventData: JSON.stringify({phraseStats}),
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
          eventData: JSON.stringify({settingName}),
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
    return this.http.post<EventLogResponse>(
        EVENT_LOGS_ENDPOINT, JSON.stringify(eventLogEntry), httpOptions);
  }
}
