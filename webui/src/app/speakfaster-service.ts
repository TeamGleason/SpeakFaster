/** HTTP service of SpeakFaster. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface PingResponse {
  ping_response: string;
}

export interface SpeakFasterServiceStub {
  ping(endpoint: string, accessToken: string): Observable<PingResponse>;
}

@Injectable()
export class SpeakFasterService implements SpeakFasterServiceStub {
  constructor(private http: HttpClient) {}

  ping(endpoint: string, accessToken: string) {
    return this.http.get<PingResponse>(endpoint, {
      params: {
        mode: 'ping',
      },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });
  }
}
