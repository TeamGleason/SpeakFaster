/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface PingResponse {
  ping_response: string;
}

export interface AbbreviationExpansionRespnose {
  exactMatches?: string[];
  prefixMatches?: string[];
}

export interface SpeakFasterServiceStub {
  ping(endpoint: string, accessToken: string): Observable<PingResponse>;

  expandAbbreviation(
      endpoint: string, accessToken: string, contextTurn: string,
      abbreviation: string): Observable<AbbreviationExpansionRespnose>;
}

@Injectable()
export class SpeakFasterService implements SpeakFasterServiceStub {
  constructor(private http: HttpClient) {}

  ping(endpoint: string, accessToken: string) {
    const headers: any = {};
    if (accessToken !== '') {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return this.http.get<PingResponse>(endpoint, {
      params: {
        mode: 'ping',
      },
      withCredentials: accessToken === '',
      headers,
    });
  }

  // TODO(cais): Add other parameters.
  expandAbbreviation(
      endpoint: string, accessToken: string, speechContent: string,
      abbreviation: string) {
    const headers: any = {};
    if (accessToken !== '') {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return this.http.get<AbbreviationExpansionRespnose>(endpoint, {
      params: {
        mode: 'abbreviation_expansion',
        acronym: abbreviation,
        speechContent,
      },
      withCredentials: accessToken === '',
      headers,
    });
  }
}
