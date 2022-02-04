/** Component that supports partner sign-in and sending of context turns. */
import {ChangeDetectorRef, Component, ElementRef, EventEmitter, OnInit, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {} from 'gapi.auth2';

import {PartnerUsersResponse, SpeakFasterService} from '../speakfaster-service';

const DEFAULT_USER_IDS: string[] = ['cais', 'testuser'];

export enum State {
  // User (partner) has not signed in yet.
  NOT_SIGNED_IN = 'NOT_SIGNED_IN',
  // User (partner) is signed in and the app is requesting the list of
  // associated AAC user(s).
  GETTING_AAC_USER_LIST = 'GETTING_AAC_USER_LIST',
  // User (partner0 is signed in and AAC user list is retrieved successfully.
  READY = 'READY',
  // ASR is ongoing.
  ASR_ONGOING = 'ASR_ONGOING',
  // Sending message.
  SENDING_MESSAGE = 'SENDING_MESSAGE',
}

@Component({
  selector: 'app-partner-component',
  templateUrl: './partner.component.html',
})
export class PartnerComponent implements OnInit {
  private static readonly GOOGLE_AUTH_SCOPE =
      'https://www.googleapis.com/auth/userinfo.email';
  private static readonly DISCOVERY_URL =
      'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

  state: State = State.NOT_SIGNED_IN;
  private clientId: string = '';

  private googleAuth?: gapi.auth2.GoogleAuth;
  private user?: gapi.auth2.GoogleUser;
  private speechRecognition: any;
  private _accessToken: string|null = null;
  private _partnerEmail: string|null = null;
  private _partnerGivenName: string|null = null;
  private _partnerProfileImageUrl: string|null = null;
  private _infoMessage: string|null = null;
  private _errorMessage: string|null = null;

  @Output() newAccessToken: EventEmitter<string> = new EventEmitter();

  @ViewChild('userIdsSelect') userIdsSelect!: ElementRef<HTMLSelectElement>;
  private readonly _userIds: string[] = [];
  @ViewChild('turnTextInput') turnTextInput!: ElementRef<HTMLTextAreaElement>;

  turnText: string = '';

  constructor(
      public speakFasterService: SpeakFasterService,
      private route: ActivatedRoute, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['client_id'] && this.clientId === '') {
        this.clientId = params['client_id'];
      }
    });
    if ((window as any).gapi) {
      gapi.load('client:auth2', () => {
        if (!this.clientId) {
          this._errorMessage = 'Missing client ID. Check URL.';
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
    } else {
      console.error('gapi is not defined. cannot perform authentication.');
    }
  }

  private getUserInfo(): void {
    if (!this.user) {
      this.user = this.googleAuth!.currentUser.get();
    }
    if (!this.user) {
      this._errorMessage = 'Failed to get current user';
      this.resetPartnerInfo();
      this.state = State.NOT_SIGNED_IN;
      this.cdr.detectChanges();
      return;
    }
    const isAuthorized =
        this.user.hasGrantedScopes(PartnerComponent.GOOGLE_AUTH_SCOPE);
    if (!isAuthorized) {
      this._errorMessage = 'Not authorized';
      this.resetPartnerInfo();
      this.state = State.NOT_SIGNED_IN;
      this.cdr.detectChanges();
      return;
    }
    this._accessToken = this.user.getAuthResponse().access_token;
    this.newAccessToken.emit(this._accessToken);
    const userProfile = this.user.getBasicProfile();
    this._partnerEmail = userProfile.getEmail();
    this._partnerGivenName = userProfile.getGivenName();
    this._partnerProfileImageUrl = userProfile.getImageUrl();
    this.state = State.GETTING_AAC_USER_LIST;
    this.speakFasterService.getPartnerUsers(this._partnerEmail!)
        .subscribe(
            (partnerUsersResonse: PartnerUsersResponse) => {
              this._userIds.splice(0);
              this._userIds.push(...partnerUsersResonse.user_ids);
              console.log('Added user IDs:', this._userIds);
              this.state = State.READY;
              this.cdr.detectChanges();
            },
            (error) => {
              this._userIds.splice(0);
              this._userIds.push(...DEFAULT_USER_IDS);
              this.state = State.READY;
              this.cdr.detectChanges();
              console.warn(
                  'Retrieving partner user IDs failed, using default user IDs:',
                  this._userIds);
            });
    this._errorMessage = null;
    if (this.turnTextInput) {
      setTimeout(() => this.turnTextInput.nativeElement.focus());
    }
    this.cdr.detectChanges();
  }

  private resetPartnerInfo() {
    this._accessToken = null;
    this._partnerEmail = null;
    this._partnerGivenName = null;
    this._partnerProfileImageUrl = null;
    this.clearMessages();
  }

  partnerToggleAuthenticationState() {
    if (this.state === State.NOT_SIGNED_IN) {
      this.googleAuth!.signIn();
    } else {
      this.googleAuth!.signOut();
    }
  }

  onTurnTextChanged(event: Event) {
    this.turnText = (event.target as HTMLInputElement).value;
  }

  onSpeakButtonClicked(event: Event) {
    if (this.state === State.ASR_ONGOING) {
      this.speechRecognition.stop();
      return;
    }

    if (this.speechRecognition === undefined) {
      const speechRecog = (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition;
      this.speechRecognition = new speechRecog();
      this.speechRecognition.continuous = false;
      this.speechRecognition.intermediateResults = true;
      this.speechRecognition.maxAlternatives = 1;
    }

    this.speechRecognition.onstart = () => {
      this.state = State.ASR_ONGOING;
      this.clearMessages();
      this._infoMessage = 'Listening. Please start speaking...';
      this.cdr.detectChanges();
    };

    this.speechRecognition.onspeechend = () => {
      this.speechRecognition.stop();
      this.state = State.READY;
      this.clearMessages();
      this.cdr.detectChanges();
    };

    this.speechRecognition.onend = () => {
      this.state = State.READY;
      this.clearMessages();
      this.cdr.detectChanges();
    };

    this.speechRecognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      this.turnTextInput.nativeElement.value = transcript.trim();
      this.turnText = transcript.trim();
      this.cdr.detectChanges();
    };

    this.speechRecognition.start();
  }

  private clearMessages() {
    this._infoMessage = null;
    this._errorMessage = null;
  }

  onClearButtonClicked(event: Event) {
    this.turnText = '';
    this.turnTextInput.nativeElement.value = '';
    this.cdr.detectChanges();
  }

  onSendButtonClicked(event: Event) {
    const speechContent = this.turnText.trim().replace(/\n/g, ' ');
    if (!speechContent) {
      this._infoMessage = null;
      this._errorMessage = 'Error: Message is empty!';
      this.cdr.detectChanges();
      return;
    }
    const userId = this.userIdsSelect.nativeElement.value;
    if (!userId) {
      this._infoMessage = null;
      this._errorMessage = 'Cannot find user ID';
      this.cdr.detectChanges();
      return;
    }
    this.state = State.SENDING_MESSAGE;
    this._infoMessage = 'Sending...';
    this._errorMessage = null;
    this.cdr.detectChanges();
    this.speakFasterService.registerContext(userId, speechContent)
        .subscribe(
            registerContextResponse => {
              console.log('reponse:', registerContextResponse);
              if (registerContextResponse.result === 'SUCCESS') {
                this.turnText = '';
                this._errorMessage = null;
                this._infoMessage =
                    `Message sent to ${userId}: "${speechContent}"`;
                if (this.turnTextInput) {
                  this.turnTextInput.nativeElement.value = '';
                }
              } else {
                this._errorMessage = 'Message not sent. There was an error.';
              }
              this.state = State.READY;
              this.cdr.detectChanges();
            },
            error => {
              this.state = State.READY;
              this._infoMessage = null;
              this._errorMessage = 'Message not sent. There was an error.';
              this.cdr.detectChanges();
            });
  }

  get signInOutButtonImgSrc(): string {
    return '/assets/images/' +
        (this.state === State.NOT_SIGNED_IN ? 'login.png' : 'logout.png');
  }

  get signInOutButtonCaption(): string {
    return 'Partner Sign-' +
        (this.state === State.NOT_SIGNED_IN ? 'In' : 'Out');
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

  get isAsrOrMessageSendOngoing(): boolean {
    return this.state === State.ASR_ONGOING ||
        this.state === State.SENDING_MESSAGE;
  }

  get infoMessage(): string|null {
    return this._infoMessage;
  }

  get errorMessage(): string|null {
    return this._errorMessage;
  }
}
