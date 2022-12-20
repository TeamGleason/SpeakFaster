/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, throwError} from 'rxjs';
import {catchError, map, timeout} from 'rxjs/operators';
import {trimStringAtHead} from 'src/utils/text-utils';

import {AbbreviationSpec} from './types/abbreviation';
import {ContextSignal} from './types/context';
import {AddContextualPhraseRequest, AddContextualPhraseResponse, ContextualPhrase, DeleteContextualPhraseRequest, DeleteContextualPhraseResponse, EditContextualPhraseRequest, EditContextualPhraseResponse, MarkContextualPhraseUsageRequest, MarkContextualPhraseUsageResponse} from './types/contextual_phrase';

export interface PingResponse {
  ping_response: string;
}

export interface AbbreviationExpansionRespnose {
  exactMatches?: string[];
  prefixMatches?: string[];
}

export interface RetrieveContextResponse {
  result: 'UNKNOWN'|'SUCCESS'|'ERROR_INVALID_USER_ID'|'ERROR_INVALID_TIMESPAN';
  errorMessage?: string;
  contextSignals?: ContextSignal[];
}

export interface RegisterContextResponse {
  result: 'UNKNOWN'|'SUCCESS';
  contextId: string;
}

export interface TextPredictionRequest {
  contextTurns: string[];

  // Text already entered by user, which the request is aimed at finding a
  // continuation to. This can be an empty string.
  textPrefix: string;

  // Timestamp for the moment at which the text-prediction is made. Should
  // be in the ISO8601 format and UTC timezone.
  timestamp?: string;

  // Timezone name in which the user is located. Must be interpretable by
  // the pytz library, e.g., "US/Central" or "America/Chicago".
  timezone?: string;

  // Tags used to filter the responses. Used for the contextual phrases (quick
  // phrases). Undefined or empty array is interpreted as no filtering.
  allowedTags?: string[];

  // ID of the user for which the text predictions are to be generated.
  userId?: string;
}

export interface TextPredictionResponse {
  outputs?: string[];

  // Contextual phrases ("quick phrases") predicted without using text prefix or
  // conversation-turn context.
  contextualPhrases?: ContextualPhrase[];
}

export interface FillMaskRequest {
  speechContent: string;

  phraseWithMask: string;

  maskInitial: string;

  originalChipStrings: string[];
}

export interface FillMaskResponse {
  results: string[];
}

export interface GetUserIdResponse {
  user_id?: string;

  error?: string;
}

export interface PartnerUsersResponse {
  user_ids: string[];
}

export interface GetLexiconRequest {
  // Language code in ISO 639-1 format. E.g., 'en-us'.
  languageCode: string;

  // Subset name.
  subset?: 'LEXICON_SUBSET_GIVEN_NAMES';

  // Prefix string used to filter the words in the reponse.
  prefix?: string;
}

export interface GetLexiconResponse {
  words: string[];
}

/** Abstract interface for SpeakFaster service backend. */
export interface SpeakFasterServiceStub {
  /** Simple ping service. Can be used to confirm backend is live. */
  ping(): Observable<PingResponse>;

  /**
   * Expand abbreviation, potentially using context.
   *
   * @param speechContent The speech content used as the context for this
   *     abbreviation expansion. If there are multiple turns of conversation,
   *     separate them with '|', e.g., 'how are you|i am fine'
   * @param abbreviationSpec Specs for the abbreviation, including the
   *     characters and keywords (if any)
   * @param numSamples: How many samples to draw from he underlying language
   *     model (prior to filtering and sorting).
   * @param precedingText the user-entered text that precedes the abbreviation.
   * @returns Options for the expanded phrase.
   */
  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number,
      precedingText?: string): Observable<AbbreviationExpansionRespnose>;

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse>;

  addContextualPhrase(request: AddContextualPhraseRequest):
      Observable<AddContextualPhraseResponse>;

  deleteContextualPhrase(request: DeleteContextualPhraseRequest):
      Observable<DeleteContextualPhraseResponse>;

  editContextualPhrase(request: EditContextualPhraseRequest):
      Observable<EditContextualPhraseResponse>;

  markContextualPhraseUsage(request: MarkContextualPhraseUsageRequest):
      Observable<MarkContextualPhraseUsageResponse>;

  fillMask(request: FillMaskRequest): Observable<FillMaskResponse>;

  // TODO(cais): Add other parameters.
  retrieveContext(userId: string): Observable<RetrieveContextResponse>;

  /**
   * Register a conversation turn as a context signal.
   * @param userId the ID of the user to whom this conversation turn is
   *     addressed.
   * @param partnerName Name of the partner who uttered the conversation turn.
   * @param speechContent content of the conversation turn.
   * @param startTimestamp the timestamp for the start of the conversation turn.
   * @param timezone name of the timezone in which the sender of the
   *     conversation turn is located.
   * @returns An Observable for the server respnose.
   */
  registerContext(
      userId: string, partnerName: string, speechContent: string,
      startTimestamp?: Date,
      timezone?: string): Observable<RegisterContextResponse>;

  /**
   * Given user email, get pseudonymized user ID.
   * @param partnerEmail
   */
  getUserId(userEmail: string): Observable<GetUserIdResponse>;

  /**
   * Given partner identity, retrieve list of AAC users associated with the
   * partner.
   */
  getPartnerUsers(partnerEmail: string): Observable<PartnerUsersResponse>;

  /**
   * Get a lexicon of given language. Supports subsets and filtering by prefix.
   */
  getLexicon(request: GetLexiconRequest): Observable<GetLexiconResponse>;
}

/** Configuration for remote service. */
export interface ServiceConfiguration {
  /** URL to service endpiont. */
  endpoint: string;

  /**
   * Access token used for authentication. If `null` will use `withCredentials:
   * true`.
   */
  accessToken: string|null;
}

let configuration: ServiceConfiguration|null = null;

export function configureService(config: ServiceConfiguration) {
  configuration = config;
}

const PING_TIMEOUT_MILLIS = 6000;
const ABBREVIATION_EXPANSION_TIMEOUT_MILLIS = 6000;
const TEXT_PREDICTION_TIMEOUT_MILLIS = 6000;
const FILL_MASK_TIMEOUT_MILLIS = 6000;
const CONTEXT_PHRASES_TIMEOUT_MILLIS = 10000;
const LEXICON_TIMEOUT_MILLIS = 10000;

const ABBREVIATION_EXPANSION_CONTEXT_MAX_LENGTH_CHARS = 1000;
const ABBREVIATION_EXPANSION_WITH_KEYWORDS_CONTEXT_MAX_LENGTH_CHARS = 200;
const TEXT_PREDICTION_CONTEXT_MAX_LENGTH_CHARS = 500;
const TEXT_PREDICTION_TEXT_PREFIX_MAX_LENGTH_CHARS = 500;
const FILL_MASK_CONTEXT_MAX_LENGTH_CHARS = 200;

export function makeTimeoutErrorMessage(
    taskName: string, timeoutMillis: number) {
  return `${taskName} (timeout: ${(timeoutMillis / 1e3).toFixed(1)} s)`;
}

@Injectable()
export class SpeakFasterService implements SpeakFasterServiceStub {
  constructor(private http: HttpClient) {}

  ping() {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params: any = {
      mode: 'ping',
    };
    return invokeEndpointCompat<PingResponse>(
               endpoint, this.http, params, headers, withCredentials,
               PING_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(
              makeTimeoutErrorMessage('Ping', PING_TIMEOUT_MILLIS));
        }));
  }

  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number, precedingText?: string) {
    const hasKeyWords = abbreviationSpec.tokens.some(token => token.isKeyword);
    const contextMathLengthChars = hasKeyWords ?
        ABBREVIATION_EXPANSION_WITH_KEYWORDS_CONTEXT_MAX_LENGTH_CHARS :
        ABBREVIATION_EXPANSION_CONTEXT_MAX_LENGTH_CHARS;
    speechContent = trimStringAtHead(speechContent, contextMathLengthChars);
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const keywordIndices: number[] = [];
    let wordAbbrevMode: string|null = null;
    for (let i = 0; i < abbreviationSpec.tokens.length; ++i) {
      const token = abbreviationSpec.tokens[i];
      if (token.isKeyword) {
        keywordIndices.push(i);
        if (wordAbbrevMode === null) {
          if (token.wordAbbrevMode) {
            wordAbbrevMode = token.wordAbbrevMode as string;
          }
        } else if (wordAbbrevMode !== token.wordAbbrevMode) {
          throw new Error(
              `Incompatible word abbrev modes: ${wordAbbrevMode} ` +
              `and ${token.wordAbbrevMode}`);
        }
      }
    }
    const params = {
      mode: 'abbreviation_expansion',
      acronym: abbreviationSpec.readableString,
      speechContent,
      keywordIndices: keywordIndices.join(','),
      precedingText: precedingText || '',
      numSamples,
    };
    if (keywordIndices && wordAbbrevMode) {
      (params as any)['wordAbbrevMode'] = wordAbbrevMode;
    }
    return invokeEndpointCompat<AbbreviationExpansionRespnose>(
               endpoint, this.http, params, headers, withCredentials,
               ABBREVIATION_EXPANSION_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Abbreviation expansion', ABBREVIATION_EXPANSION_TIMEOUT_MILLIS));
        }));
  }

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const speechContent = trimStringAtHead(
        textPredictionRequest.contextTurns.join('|'),
        TEXT_PREDICTION_CONTEXT_MAX_LENGTH_CHARS);
    const textPrefix = trimStringAtHead(
        textPredictionRequest.textPrefix,
        TEXT_PREDICTION_TEXT_PREFIX_MAX_LENGTH_CHARS);
    const params: any = {
      userId: textPredictionRequest.userId || '',
      mode: 'text_continuation',
      speechContent,
      textPrefix,
    };
    if (textPredictionRequest.timestamp) {
      params['timestamp'] = textPredictionRequest.timestamp;
    }
    if (textPredictionRequest.timezone) {
      params['timezone'] = textPredictionRequest.timezone;
    }
    if (textPredictionRequest.allowedTags) {
      params['allowedTags'] = textPredictionRequest.allowedTags.join(',');
    }
    return invokeEndpointCompat<TextPredictionResponse>(
               endpoint, this.http, params, headers, withCredentials,
               TEXT_PREDICTION_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Text prediction', TEXT_PREDICTION_TIMEOUT_MILLIS));
        }));
  }

  addContextualPhrase(request: AddContextualPhraseRequest):
      Observable<AddContextualPhraseResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params: any = {
      mode: 'add_contextual_phrase',
      userId: request.userId,
      text: request.contextualPhrase.text,
      tags: request.contextualPhrase.tags ?
          request.contextualPhrase.tags.join(',') :
          undefined,
    };
    return invokeEndpointCompat<AddContextualPhraseResponse>(
               endpoint, this.http, params, headers, withCredentials,
               CONTEXT_PHRASES_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Add context phrase', CONTEXT_PHRASES_TIMEOUT_MILLIS));
        }));
  }

  deleteContextualPhrase(request: DeleteContextualPhraseRequest):
      Observable<DeleteContextualPhraseResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params: any = {
      mode: 'delete_contextual_phrase',
      userId: request.userId,
      phraseId: request.phraseId,
    };
    return invokeEndpointCompat<DeleteContextualPhraseResponse>(
               endpoint, this.http, params, headers, withCredentials)
        .pipe(timeout(CONTEXT_PHRASES_TIMEOUT_MILLIS), catchError(error => {
                return throwError(makeTimeoutErrorMessage(
                    'Delete context phrase', CONTEXT_PHRASES_TIMEOUT_MILLIS));
              }));
  }

  editContextualPhrase(request: EditContextualPhraseRequest):
      Observable<EditContextualPhraseResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params: any = {
      mode: 'edit_contextual_phrase',
      userId: request.userId,
      phraseId: request.phraseId,
      text: request.text,
      displayText: request.displayText,
    };
    return invokeEndpointCompat<EditContextualPhraseResponse>(
               endpoint, this.http, params, headers, withCredentials,
               CONTEXT_PHRASES_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Edit context phrase', CONTEXT_PHRASES_TIMEOUT_MILLIS));
        }));
  }

  markContextualPhraseUsage(request: MarkContextualPhraseUsageRequest):
      Observable<MarkContextualPhraseUsageResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params: any = {
      mode: 'mark_contextual_phrase_usage',
      userId: request.userId,
      phraseId: request.phraseId,
      lastUsedTimestamp: new Date().toISOString(),
    };
    return invokeEndpointCompat<MarkContextualPhraseUsageResponse>(
               endpoint, this.http, params, headers, withCredentials,
               CONTEXT_PHRASES_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Mark context phrase', CONTEXT_PHRASES_TIMEOUT_MILLIS));
        }));
  }

  fillMask(request: FillMaskRequest): Observable<FillMaskResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    request = {
      ...request,
      speechContent: trimStringAtHead(
          request.speechContent, FILL_MASK_CONTEXT_MAX_LENGTH_CHARS),
    };
    const params = {
      mode: 'fill_mask',
      ...request,
    };
    return invokeEndpointCompat<FillMaskResponse>(
               endpoint, this.http, params, headers, withCredentials,
               FILL_MASK_TIMEOUT_MILLIS)
        .pipe(catchError(error => {
          return throwError(makeTimeoutErrorMessage(
              'Word replacement', FILL_MASK_TIMEOUT_MILLIS));
        }));
  }

  retrieveContext(userId: string): Observable<RetrieveContextResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params = {
      mode: 'retrieve_context',
      userId: userId,
    };
    return invokeEndpointCompat<RetrieveContextResponse>(
        endpoint, this.http, params, headers, withCredentials,
        CONTEXT_PHRASES_TIMEOUT_MILLIS);
  }

  registerContext(
      userId: string, partnerName: string, speechContent: string,
      startTimestamp?: Date,
      timezone?: string): Observable<RegisterContextResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    startTimestamp = startTimestamp || new Date();
    timezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = {
      mode: 'register_context',
      userId: userId,
      speechContent: speechContent,
      startTimestamp: startTimestamp.toISOString(),
      timezone: timezone,
      speakerId: partnerName,
    };
    return invokeEndpointCompat<RegisterContextResponse>(
        endpoint, this.http, params, headers, withCredentials,
        CONTEXT_PHRASES_TIMEOUT_MILLIS);
  }

  getUserId(userEmail: string): Observable<GetUserIdResponse> {
    return this.http.get<GetUserIdResponse>('/get_user_id', {
      params: {
        user_email: userEmail,
      },
    });
    // TODO(cais): Add unit tests.
  }

  getPartnerUsers(partnerEmail: string): Observable<PartnerUsersResponse> {
    const {headers, withCredentials} = this.getServerCallParams();
    return this.http.get<PartnerUsersResponse>('/partner_users', {
      params: {
        partner_email: partnerEmail,
      },
      withCredentials,
      headers,
    });
  }

  getLexicon(request: GetLexiconRequest): Observable<GetLexiconResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const params = {
      mode: 'get_lexicon',
      languageCode: request.languageCode,
      subset: request.subset || '',
      prefix: request.prefix || '',
    };
    return invokeEndpointCompat<GetLexiconResponse>(
        endpoint, this.http, params, headers, withCredentials,
        LEXICON_TIMEOUT_MILLIS);
  }

  private getServerCallParams(): {
    endpoint: string,
    headers: any,
    withCredentials: boolean,
  } {
    if (configuration === null) {
      throw new Error(
          'Service is not configured yet. Call configureService() first.');
    }
    if (configuration.endpoint === '') {
      throw new Error(
          'Service endpoint is empty. ' +
          'Call configureService() with a non-empty endpoint first.');
    }
    const headers: any = {};
    if (configuration.accessToken !== '') {
      headers['Authorization'] = `Bearer ${configuration.accessToken}`;
    }
    const withCredentials: boolean = configuration.accessToken === '';
    return {endpoint: configuration.endpoint, headers, withCredentials};
  }
}

/**
 * Invokes API endpoint in a backward-compatible way.
 */
export function invokeEndpointCompat<T>(
    endpoint: string, http: HttpClient, params: any, headers: any,
    withCredentials: boolean, timeoutMillis?: number,
    runAsMe: boolean = false): Observable<T> {
  if (endpoint.endsWith(':call')) {  // New POST endpoint.
    const body = {json: JSON.stringify(params)};
    if (runAsMe) {
      (body as any)['runAsMe'] = true;
    }
    let observable =
        http.post<T>(endpoint, body, {
              headers,
            })
            .pipe(
                map(response => maybeStripJsonField(response) as T),
            );
    if (timeoutMillis) {
      observable = observable.pipe(timeout(timeoutMillis));
    }
    return observable;
  } else {  // Old GET endpoint.
    return http.get<T>(endpoint, {
      params,
      withCredentials,
      headers,
    });
  }
}

export function maybeStripJsonField(response: any) {
  if (response.json) {
    if (typeof response.json === 'string') {
      return JSON.parse(response.json);
    }
    return response.json;
  }
  return response;
}
