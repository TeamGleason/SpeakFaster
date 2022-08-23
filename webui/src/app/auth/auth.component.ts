import {AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {MatSnackBar, MatSnackBarConfig} from '@angular/material/snack-bar';
import {ActivatedRoute} from '@angular/router';
import {createUuid} from 'src/utils/uuid';

import {registerNewAccessToken, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {isPlainAlphanumericKey} from '../../utils/keyboard-utils';

import {DeviceCodeResponse, GoogleDeviceAuthService, TokenResponse} from './google-device-auth-service';

@Component({
  selector: 'app-auth-component',
  templateUrl: './auth.component.html',
  providers: [GoogleDeviceAuthService],
})
export class AuthComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'AuthComponent';

  clientId = '';
  clientSecret = '';
  accessToken = '';
  refreshToken = '';
  showAuthButton = false;

  private readonly instanceId = AuthComponent._NAME + '_' + createUuid();
  private refreshTokenIntervalSeconds = 60 * 5;
  private shouldStopRefreshToken = false;

  @Output() newAccessToken: EventEmitter<string> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  constructor(
      private route: ActivatedRoute,
      public authService: GoogleDeviceAuthService,
      private snackBar: MatSnackBar) {

    (window as any).getAccessToken = (): string => {
      return this.accessToken;
    }
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['access_token']) {
        this.newAccessToken.emit(params['access_token']);
        return;
      }
      if (params['client_secret'] && this.clientSecret === '') {
        this.clientSecret = params['client_secret'];
      }
      if (params['client_id'] && this.clientId === '') {
        this.clientId = params['client_id'];
      }
    });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  // Info related to limited-input device authentication.
  public deviceCodeData: DeviceCodeResponse|null = null;

  authenticate() {
    if (this.clientId === '') {
      this.showSnackBar('Cannot authenticate. Missing client ID.', 'error');
      return;
    }
    if (this.clientSecret === '') {
      return;
    }
    this.authService.getDeviceCode(this.clientId)
        .subscribe(
            async data => {
              this.deviceCodeData = data;
              this.copyTextToClipboard(data.user_code);
              await this.pollForAccessTokenUntilSuccess();
              this.applyRefreshTokenIndefinitely();
              this.snackBar.dismiss();
            },
            error => {
              this.showSnackBar(
                  'Failed to start authentication. Check your network.',
                  'error');
            });
  }

  handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (isPlainAlphanumericKey(event, 'a') && this.deviceCodeData === null) {
      this.authenticate();
      return true;
    }
    return false;
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

  private async applyRefreshTokenOnce(): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
      this.authService
          .applyRefreshToken(
              this.clientId, this.clientSecret, this.refreshToken)
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
    if (this.deviceCodeData.interval < 0) {
      return;
    }
    while (true) {
      await this.sleepForSeconds(this.deviceCodeData.interval);
      try {
        const tokenResponse = await this.pollForAccessTokenOnce();
        if (tokenResponse.access_token != null) {
          this.accessToken = tokenResponse.access_token;
          this.refreshToken = tokenResponse.refresh_token!;
          this.newAccessToken.emit(this.accessToken);
          registerNewAccessToken(this.accessToken);
          console.log(`New accessToken: ${this.accessToken}`);
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
    if (this.deviceCodeData!.interval < 0) {
      return;
    }
    if (this.refreshToken === '') {
      throw new Error('Cannot apply refresh token: refresh token unavailable');
    }
    this.shouldStopRefreshToken = false;
    while (!this.shouldStopRefreshToken) {
      await this.sleepForSeconds(this.refreshTokenIntervalSeconds);
      try {
        const tokenResponse = await this.applyRefreshTokenOnce();
        if (tokenResponse.access_token != null) {
          this.accessToken = tokenResponse.access_token;
          this.newAccessToken.emit(this.accessToken);
          registerNewAccessToken(this.accessToken);
          console.log('Access token refreshed successfully');
          console.log(`New accessToken: ${this.accessToken}`);
        } else {
          console.log(
              'Application of refresh token failed: No access_token found in response');
        }
      } catch (error) {
        console.error('Application of refresh token failed:', error);
      }
    }
  }

  showSnackBar(text: string, type: 'info'|'error') {
    const config: MatSnackBarConfig = new MatSnackBarConfig();
    config.panelClass = [type];
    this.snackBar.open(text, 'X', config);
  }

  private async copyTextToClipboard(text: string) {
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

    this.showSnackBar(`Copied ${text} to clipboard`, 'info');
  }

  setRefreshTokenIntervalSecondsForTest(refreshTokenIntervalSeconds: number) {
    this.refreshTokenIntervalSeconds = refreshTokenIntervalSeconds;
  }

  stopRefreshTokenForTest() {
    this.shouldStopRefreshToken = true;
  }
}
