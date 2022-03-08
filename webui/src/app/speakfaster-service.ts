/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable, throwError} from 'rxjs';
import {catchError, timeout} from 'rxjs/operators';
import {trimStringAtHead} from 'src/utils/text-utils';

import {AbbreviationSpec} from './types/abbreviation';
import {ContextSignal} from './types/context';
import {AddContextualPhraseRequest, AddContextualPhraseResponse, ContextualPhrase, DeleteContextualPhraseRequest, DeleteContextualPhraseResponse} from './types/contextual_phrase';

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

  maskInitial: string
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

const ABBREVIATION_EXPANSION_TIMEOUT_MILLIS = 6000;
const TEXT_PREDICTION_TIMEOUT_MILLIS = 6000;
const FILL_MASK_TIMEOUT_MILLIS = 6000;
const CONTEXT_PHRASES_TIMEOUT_MILLIS = 10000;

const ABBREVIATION_EXPANSION_CONTEXT_MAX_LENGTH_CHARS = 1000;
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
    const {headers, withCredentials} = this.getServerCallParams();
    return this.http.get<PingResponse>(configuration!.endpoint, {
      params: {
        mode: 'ping',
      },
      withCredentials,
      headers,
    });
  }

  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number, precedingText?: string) {
    speechContent = trimStringAtHead(
        speechContent, ABBREVIATION_EXPANSION_CONTEXT_MAX_LENGTH_CHARS);
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const keywordIndices: number[] = [];
    for (let i = 0; i < abbreviationSpec.tokens.length; ++i) {
      if (abbreviationSpec.tokens[i].isKeyword) {
        keywordIndices.push(i);
      }
    }
    return this.http
        .get<AbbreviationExpansionRespnose>(endpoint, {
          params: {
            mode: 'abbreviation_expansion',
            acronym: abbreviationSpec.readableString,
            speechContent,
            keywordIndices: keywordIndices.join(','),
            precedingText: precedingText || '',
            numSamples,
          },
          withCredentials,
          headers,
        })
        .pipe(
            timeout(ABBREVIATION_EXPANSION_TIMEOUT_MILLIS),
            catchError(error => {
              return throwError(makeTimeoutErrorMessage(
                  'Abbreviation expansion',
                  ABBREVIATION_EXPANSION_TIMEOUT_MILLIS));
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
    return this.http
        .get<TextPredictionResponse>(endpoint, {
          params,
          withCredentials,
          headers,
        })
        .pipe(timeout(TEXT_PREDICTION_TIMEOUT_MILLIS), catchError(error => {
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
    return this.http
        .get<AddContextualPhraseResponse>(endpoint, {
          params,
          withCredentials,
          headers,
        })
        .pipe(timeout(CONTEXT_PHRASES_TIMEOUT_MILLIS), catchError(error => {
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
    return this.http
        .get<DeleteContextualPhraseResponse>(endpoint, {
          params,
          withCredentials,
          headers,
        })
        .pipe(timeout(CONTEXT_PHRASES_TIMEOUT_MILLIS), catchError(error => {
                return throwError(makeTimeoutErrorMessage(
                    'Delete context phrase', CONTEXT_PHRASES_TIMEOUT_MILLIS));
              }));
  }

  fillMask(request: FillMaskRequest): Observable<FillMaskResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    request = {
      ...request,
      speechContent: trimStringAtHead(
          request.speechContent, FILL_MASK_CONTEXT_MAX_LENGTH_CHARS),
    };
    return this.http
        .get<FillMaskResponse>(endpoint, {
          params: {
            mode: 'fill_mask',
            ...request,
          },
          withCredentials,
          headers,
        })
        .pipe(timeout(FILL_MASK_TIMEOUT_MILLIS), catchError(error => {
                return throwError(makeTimeoutErrorMessage(
                    'Word replacement', FILL_MASK_TIMEOUT_MILLIS));
              }));
  }

  retrieveContext(userId: string) {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    return this.http.get<RetrieveContextResponse>(endpoint, {
      params: {
        mode: 'retrieve_context',
        userId: userId,
      },
      withCredentials,
      headers,
    });
  }

  registerContext(
      userId: string, partnerName: string, speechContent: string,
      startTimestamp?: Date,
      timezone?: string): Observable<RegisterContextResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    startTimestamp = startTimestamp || new Date();
    timezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return this.http.get<RegisterContextResponse>(endpoint, {
      params: {
        mode: 'register_context',
        userId: userId,
        speechContent: speechContent,
        startTimestamp: startTimestamp.toISOString(),
        timezone: timezone,
        speakerId: partnerName,
      },
      withCredentials,
      headers,
    });
  }

  getUserId(userEmail: string): Observable<GetUserIdResponse> {
    const {headers, withCredentials} = this.getServerCallParams();
    return this.http.get<GetUserIdResponse>('/get_user_id', {
      params: {
        user_email: userEmail,
      },
      withCredentials,
      headers,
    });
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
    return this.http.get<GetLexiconResponse>(endpoint, {
      params: {
        mode: 'get_lexicon',
        languageCode: request.languageCode,
        subset: request.subset || '',
        prefix: request.prefix || '',
      },
      withCredentials,
      headers,
    });
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
