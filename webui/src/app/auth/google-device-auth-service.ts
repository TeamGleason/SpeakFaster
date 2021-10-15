/** Authentication service for limited-input devices, provided by Google. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface DeviceCodeResponse {
  user_code: string;
  verification_url: string;
  interval: number;
  device_code: string;
}

export interface TokenResponse {
  access_token: string|undefined;
  refresh_token: string|undefined;
}

export interface GoogleDeviceAuthServiceStub {
  /**
   * Get device code. This is the first step in the limited-input-device
   * authentication workflow.
   * @param client_id
   */
  getDeviceCode(client_id: string): Observable<DeviceCodeResponse>;

  /**
   * Poll for access token. This awaits the user to go to the verification URL,
   * enter the user code, and select the Google Account for authentication.
   * @param client_id
   * @param client_secret
   * @param device_code This comes from the return value of `getDeviceCode()`.
   */
  pollForAccessToken(
      client_id: string, client_secret: string,
      device_code: string): Observable<TokenResponse>;

  /**
   * Use the refresh token from `pollForAccessToken()` to get a new access
   * token.
   * @param client_id
   * @param client_secret
   * @param refresh_token This comes from the return value of
   *     `pollForAccessToken()`.
   */
  applyRefreshToken(
      client_id: string, client_secret: string,
      refresh_token: string): Observable<TokenResponse>;
}

@Injectable()
export class GoogleDeviceAuthService implements GoogleDeviceAuthServiceStub {
  readonly DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
  readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';

  constructor(private http: HttpClient) {}

  getDeviceCode(client_id: string) {
    return this.http.post<DeviceCodeResponse>(this.DEVICE_CODE_URL, {
      client_id,
      scope: 'email profile',
    });
  }

  pollForAccessToken(
      client_id: string, client_secret: string, device_code: string) {
    return this.http.post<TokenResponse>(this.TOKEN_URL, {
      client_id,
      client_secret,
      device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  }

  applyRefreshToken(
      client_id: string, client_secret: string, refresh_token: string) {
    return this.http.post<TokenResponse>(this.TOKEN_URL, {
      client_id,
      client_secret,
      refresh_token,
      grant_type: 'refresh_token',
    });
  }
}
