/** Component that supports partner sign-in and sending of context turns. */
import {ChangeDetectorRef, Component, ElementRef, EventEmitter, OnInit, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {} from 'gapi.auth2';

import {PartnerUsersResponse, SpeakFasterService} from '../speakfaster-service';

const DEFAULT_USER_IDS: string[] = ['cais', 'testuser'];

@Component({
  selector: 'app-partner-component',
  templateUrl: './partner.component.html',
})
export class PartnerComponent implements OnInit {
  private static readonly GOOGLE_AUTH_SCOPE =
      'https://www.googleapis.com/auth/userinfo.email';
  private static readonly DISCOVERY_URL =
      'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

  private clientId: string = '';

  private googleAuth: any;  // TODO(cais): Use typing.
  private user?: gapi.auth2.GoogleUser;
  private _accessToken: string|null = null;
  private _partnerEmail: string|null = null;
  private _partnerGivenName: string|null = null;
  private _partnerProfileImageUrl: string|null = null;
  private _infoMessage: string|null = null;
  private _errorMessage: string|null = null;

  @Output() newAccessToken: EventEmitter<string> = new EventEmitter();

  @ViewChild('userIdsSelect') userIdsSelect!: ElementRef<HTMLSelectElement>;
  private _userIds: string[] = [];

  turnText: string = '';

  constructor(
      public speakFasterService: SpeakFasterService,
      private route: ActivatedRoute,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['client_id'] && this.clientId === '') {
        this.clientId = params['client_id'];
      }
    });
    gapi.load('client:auth2', () => {
      if (!this.clientId) {
        this._errorMessage = 'Missing client ID. Check URL.'
        this.cdr.detectChanges();
        return;
      }
      gapi.client
          .init({
            clientId: this.clientId,
            scope: PartnerComponent.GOOGLE_AUTH_SCOPE,
            discoveryDocs: [PartnerComponent.DISCOVERY_URL],
          })
          .then(() => {
            this.googleAuth = gapi.auth2.getAuthInstance();
            this.googleAuth.isSignedIn.listen(() => {
              this.getUserInfo();
            });
            this.getUserInfo();
          });
    });
  }

  private getUserInfo(): void {
    if (!this.user) {
      this.user = this.googleAuth.currentUser.get();
    }
    if (!this.user) {
      this._errorMessage = 'Failed to get current user';
      this.resetPartnerInfo();
      this.cdr.detectChanges();
      return;
    }
    const isAuthorized =
        this.user.hasGrantedScopes(PartnerComponent.GOOGLE_AUTH_SCOPE);
    if (!isAuthorized) {
      this._errorMessage = 'Not authorized';
      this.resetPartnerInfo();
      this.cdr.detectChanges();
      return;
    }
    this._accessToken = this.user.getAuthResponse().access_token;
    this.newAccessToken.emit(this._accessToken);
    const userProfile = this.user.getBasicProfile();
    this._partnerGivenName = userProfile.getGivenName();
    this._partnerProfileImageUrl = userProfile.getImageUrl();
    this.speakFasterService.getPartnerUsers(this._partnerEmail!)
        .subscribe(
            (partnerUsersResonse: PartnerUsersResponse) => {
              console.log('user list:', partnerUsersResonse.user_ids);
            },
            (error) => {
              this._userIds = DEFAULT_USER_IDS;
              this.cdr.detectChanges();
              console.warn(
                  'Retrieving partner user IDs failed, using default user IDs:',
                  this._userIds);
            });
    this._errorMessage = null;
    this.cdr.detectChanges();
  }

  private resetPartnerInfo() {
    this._accessToken = null;
    this._partnerEmail = null;
    this._partnerGivenName = null;
    this._partnerProfileImageUrl = null;
    this._infoMessage = null;
    this._errorMessage = null;
  }

  partnerAuthenticate() {
    if (this.isPartnerSignedIn) {
      this.googleAuth.signOut();
    } else {
      this.googleAuth.signIn();
    }
  }

  onTurnTextChanged(event: Event) {
    this.turnText = (event.target as HTMLInputElement).value;
  }

  onSendButtonClicked(event: Event) {
    const speechContent = this.turnText.trim();
    if (!speechContent) {
      return;
    }
    const userId = this.userIdsSelect.nativeElement.value;
    if (!userId) {
      this._errorMessage = 'Cannot find user ID';
      return;
    }
    this.speakFasterService.registerContext(userId, speechContent)
        .subscribe(
            registerContextResponse => {
              console.log('reponse:', registerContextResponse);
              if (registerContextResponse.result === 'SUCCESS') {
                this._infoMessage = 'Message sent';
                this.turnText = '';
              } else {
                this._errorMessage = 'Message not sent. There was an error.';
              }
              this.cdr.detectChanges();
            }, error => {
              this._errorMessage = 'Message not sent. There was an error.';
              this.cdr.detectChanges();
            });
  }

  get signInOutButtonImgSrc(): string {
    return '/assets/images/' +
        (this.isPartnerSignedIn ? 'logout.png' : 'login.png');
  }

  get signInOutButtonCaption(): string {
    return 'Partner Sign-' + (this.isPartnerSignedIn ? 'Out' : 'In');
  }

  get isPartnerSignedIn(): boolean {
    if (!this.user) {
      return false;
    }
    return this.user.hasGrantedScopes(PartnerComponent.GOOGLE_AUTH_SCOPE);
  }

  get partnerGivenName(): string|null {
    return this._partnerGivenName;
  }

  get partnerProfileImageUrl(): string|null {
    return this._partnerProfileImageUrl;
  }

  get userIds(): string[] {
    return this._userIds;
  }

  get infoMessage(): string|null {
    return this._infoMessage;
  }

  get errorMessage(): string|null {
    return this._errorMessage;
  }
}
