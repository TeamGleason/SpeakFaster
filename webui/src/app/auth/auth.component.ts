import {Component} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';
import {ActivatedRoute} from '@angular/router';

import {DeviceCodeResponse, GoogleDeviceAuthService, TokenResponse} from './google-device-auth-service';

@Component({
  selector: 'auth-component',
  templateUrl: './auth.component.html',
  providers: [GoogleDeviceAuthService],
})
export class AuthComponent {
  clientId = '';
  clientSecret = '';
  accessToken = '';
  refreshToken = '';

  readonly REFRESH_TOKEN_INTERVAL_SECONDS = 60 * 5;

  constructor(
      private route: ActivatedRoute,
      private authService: GoogleDeviceAuthService,
      private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['client_secret'] && this.clientSecret === '') {
        this.clientSecret = params['client_secret'];
      }
      if (params['client_id'] && this.clientId === '') {
        this.clientId = params['client_id'];
      }
    });
  }

  // Info related to limited-input device authentication.
  public deviceCodeData: DeviceCodeResponse|null = null;

  authenticate() {
    if (this.clientId === '') {
      this.snackBar.open('Cannot authenticate. Missing client ID.')
    }
    if (this.clientSecret === '') {
      this.snackBar.open('Cannot authenticate. Missing client secret.')
      return;
    }
    this.authService.getDeviceCode(this.clientId).subscribe(async data => {
      this.deviceCodeData = data;
      this.copyTextToClipboard(data.user_code);
      await this.pollForAccessTokenUntilSuccess();
      this.applyRefreshTokenIndefinitely();
      this.snackBar.dismiss();
    });
  }

  clientSecretChange(event: Event) {
    this.clientSecret = (event.target as HTMLInputElement).value.trim();
  }

  private async sleepForSeconds(seconds: number) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * Poll once for the access token.
   *
   * This should be called only after getting the device code.
   *
   * @returns Response from the /token endpoint.
   */
  private async pollForAccessTokenOnce(): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
      this.authService
          .pollForAccessToken(
              this.clientId, this.clientSecret,
              this.deviceCodeData!.device_code)
          .subscribe(tokenResponse => {
            return resolve(tokenResponse);
          }, error => reject(error));
    });
  }

  /**
   * Poll the /token endpoint until an access token and a refresh token are
   * available.
   *
   * This should be called only after getting the device code.
   */
  private async pollForAccessTokenUntilSuccess() {
    if (this.deviceCodeData == null) {
      throw new Error(
          'Cannot poll for access token yet. Device code unavailable.');
    }
    while (true) {
      await this.sleepForSeconds(this.deviceCodeData!.interval);
      try {
        const tokenResponse = await this.pollForAccessTokenOnce();
        if (tokenResponse.access_token != null) {
          this.accessToken = tokenResponse.access_token;
          this.refreshToken = tokenResponse.refresh_token!;
          break;
        }
      } catch (error) {
      }
    }
  }

  /**
   * Periodically check for refresh token.
   *
   * This should be called only after an access token and a refresh token is
   * available.
   */
  private async applyRefreshTokenIndefinitely() {
    if (this.refreshToken === '') {
      throw new Error('Cannot apply refresh token: refresh token unavailable');
    }
    while (true) {
      await this.sleepForSeconds(this.REFRESH_TOKEN_INTERVAL_SECONDS);
      this.authService
          .applyRefreshToken(
              this.clientId, this.clientSecret, this.refreshToken)
          .subscribe(
              data => {
                if (data.access_token != null) {
                  this.accessToken = data.access_token;
                  console.log('Access token refreshed successfully');
                } else {
                  console.log(
                      'Application of refresh token failed: No access_token found in response');
                }
              },
              error => {
                console.error('Application of refresh token failed:', error);
              });
    }
  }

  private async copyTextToClipboard(text: string) {
    await this.sleepForSeconds(0.5);
    const textNode = document.createTextNode(text);
    document.body.appendChild(textNode);
    const range = document.createRange();
    const getSelection = window.getSelection as Function;
    range.selectNodeContents(textNode);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    document.execCommand('copy');
    getSelection().removeAllRanges();
    textNode.remove();
    console.log(`Copied ${text} to clipboard`);

    // TODO(cais): properly style the snack bar.
    this.snackBar.open(`Copied ${text} to clipboard`, 'X');
  }
}
