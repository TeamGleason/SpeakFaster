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
}

// export interface RetrieveContextRequest {
//   userId: string;
//   maxNumSignals?: number;
//   contextSignalType?: string;
// }

export interface RetrieveContextResponse {
  result: 'UNKNOWN'|'SUCCESS'|'ERROR_INVALID_USER_ID'|'ERROR_INVALID_TIMESPAN';
  errorMessage?: string;
  contextSignals?: ContextSignal[];
}

export interface SpeakFasterServiceStub {
  ping(endpoint: string, accessToken: string): Observable<PingResponse>;

  expandAbbreviation(
      endpoint: string, accessToken: string, contextTurn: string,
      abbreviationSpec: AbbreviationSpec):
      Observable<AbbreviationExpansionRespnose>;

  // TODO(cais): Add other parameters.
  retrieveContext(endpoint: string, accessToken: string, userId: string):
      Observable<RetrieveContextResponse>;
}

@Injectable()
export class SpeakFasterService implements SpeakFasterServiceStub {
  constructor(private http: HttpClient) {}

  ping(endpoint: string, accessToken: string) {
    const {headers, withCredentials} =
        this.getHeadersAndWithCredentials(accessToken);
    return this.http.get<PingResponse>(endpoint, {
      params: {
        mode: 'ping',
      },
      withCredentials,
      headers,
    });
  }

  // TODO(cais): Add other parameters.
  expandAbbreviation(
      endpoint: string, accessToken: string, speechContent: string,
      abbreviationSpec: AbbreviationSpec) {
    const {headers, withCredentials} =
        this.getHeadersAndWithCredentials(accessToken);
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
        keywordIndices: keywordIndices.join(',')
      },
      withCredentials,
      headers,
    });
  }

  // TODO(cais): Add other parameters.
  retrieveContext(endpoint: string, accessToken: string, userId: string) {
    const {headers, withCredentials} =
        this.getHeadersAndWithCredentials(accessToken);
    return this.http.get<RetrieveContextResponse>(endpoint, {
      params: {
        mode: 'retrieve_context',
        userId: userId,
      },
      withCredentials,
      headers,
    });
  }

  private getHeadersAndWithCredentials(accessToken: string): {
    headers: any,
    withCredentials: boolean,
  } {
    const headers: any = {};
    if (accessToken !== '') {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const withCredentials: boolean = accessToken === '';
    return {headers, withCredentials};
  }
}
