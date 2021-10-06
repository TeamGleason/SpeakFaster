/** Authentication service for limited-input devices, provided by Google. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';

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

@Injectable()
export class GoogleDeviceAuthService {
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
