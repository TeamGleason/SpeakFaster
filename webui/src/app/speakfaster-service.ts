/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {AbbreviationSpec} from './types/abbreviations';

export interface PingResponse {
  ping_response: string;
}

export interface AbbreviationExpansionRespnose {
  exactMatches?: string[];
  prefixMatches?: string[];
}

export interface ConversationTurn {
  speakerId?: string;
  speechContent: string;
  startTimestamp?: string;
  endTimestamp?: string;
  timezone?: string;
  isHardcoded?: boolean;
  isTts?: boolean;
}

export interface PartnerProximityEvent {
  eventType: 'UNKNOWN'|'FOUND'|'LOST';
  partnerId: string;
  distanceM: number;
}

export interface ContextSignal {
  userId: string;
  contextId?: string;
  conversationTurn?: ConversationTurn;
  partnerProximityEvent?: PartnerProximityEvent;
  timestamp?: string;
  timezone?: string;
  isManuallyAdded?: boolean;
}

export interface RetrieveContextResponse {
  result: 'UNKNOWN'|'SUCCESS'|'ERROR_INVALID_USER_ID'|'ERROR_INVALID_TIMESPAN';
  errorMessage?: string;
  contextSignals?: ContextSignal[];
}

export interface TextPredictionResponse {
  outputs: string[],
}

export interface FillMaskResponse {
  results: string[];
}

export interface SpeakFasterServiceStub {
  ping(): Observable<PingResponse>;

  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number): Observable<AbbreviationExpansionRespnose>;

  textPrediction(contextTurns: string[], textPrefix: string):
      Observable<TextPredictionResponse>;

  fillMask(speechContent: string, phraseWithMask: string, maskInitial: string):
      Observable<FillMaskResponse>;

  // TODO(cais): Add other parameters.
  retrieveContext(userId: string): Observable<RetrieveContextResponse>;
}

export interface ServiceConfiguration {
  endpoint: string, accessToken: string|null,
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

  // TODO(cais): Add other parameters.
  expandAbbreviation(
      speechContent: string, abbreviationSpec: AbbreviationSpec,
      numSamples: number) {
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
        numSamples,
      },
      withCredentials,
      headers,
    });
  }

  textPrediction(contextTurns: string[], textPrefix: string):
      Observable<TextPredictionResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    return this.http.get<TextPredictionResponse>(endpoint, {
      params: {
        mode: 'text_continuation',
        speechContent: contextTurns.join('|'),
        textPrefix,
      },
      withCredentials,
      headers,
    });
  }

  fillMask(speechContent: string, phraseWithMask: string, maskInitial: string):
      Observable<FillMaskResponse> {
    const {endpoint, headers, withCredentials} = this.getServerCallParams();
    return this.http.get<FillMaskResponse>(endpoint, {
      params: {
        mode: 'fill_mask',
        speechContent,
        phraseWithMask,
        maskInitial,
      },
      withCredentials,
      headers,
    });
  }

  // TODO(cais): Add other parameters.
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
