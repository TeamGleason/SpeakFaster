/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {AbbreviationSpec} from './types/abbreviation';

export interface PingResponse {
  ping_response: string;
}

export interface AbbreviationExpansionRespnose {
  exactMatches?: string[];
  prefixMatches?: string[];
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
   * @returns Options for the expanded phrase.
   */
  expandAbbreviation(
      speechContent: string,
      abbreviationSpec: AbbreviationSpec,
      numSamples: number,
      precedingText?: string): Observable<AbbreviationExpansionRespnose>;
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
      speechContent: string,
      abbreviationSpec: AbbreviationSpec,
      numSamples: number,
      precedingText?: string) {
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
