/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {AbbreviationSpec} from './types/abbreviation';
import {ContextSignal} from './types/context';

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

export interface PartnerUsersResponse {
  user_ids: string[];
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

  retrieveContext(userId: string): Observable<RetrieveContextResponse>;

  /**
   * Register a conversation turn as a context signal.
   * @param userId the ID of the user to whom this conversation turn is
   *     addressed.
   * @param speechContent content of the conversation turn.
   * @param startTimestamp the timestamp for the start of the conversation turn.
   * @param timezone name of the timezone in which the sender of the
   *     conversation turn is located,
   * @returns An Observable for the server respnose.
   */
  registerContext(
      userId: string, speechContent: string, startTimestamp?: Date,
      timezone?: string): Observable<RegisterContextResponse>;

  /**
   * Given partner identity, retrieve list of AAC users associated with the
   * partner.
   */
  getPartnerUsers(partnerEmail: string): Observable<PartnerUsersResponse>;
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
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    const keywordIndices: number[] = [];
    for (let i = 0; i < abbreviationSpec.tokens.length; ++i) {
      if (abbreviationSpec.tokens[i].isKeyword) {
        keywordIndices.push(i);
      }
    }
    return this.http.get<AbbreviationExpansionRespnose>(endpoint, {
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
    });
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
      userId: string, speechContent: string, startTimestamp?: Date,
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
    })
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
