import {} from 'gapi.auth2';

const GOOGLE_AUTH_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_URL =
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

export class OAuth2Helper {
  private googleAuth?: gapi.auth2.GoogleAuth;
  private user?: gapi.auth2.GoogleUser;
  private _accessToken: string|null = null;

  /** Singleton access. Requires a unique client ID. */
  public getInstance(client_id: string) {

  }

  constructor(
      private readonly clientId: string,
      private onNewAccessToken: (token: string) => void) {}

  public init() {
    gapi.load('client:auth2', () => {
      if (!this.clientId) {
        //  TODO(cais): Turn into callback.
        //   this._errorMessage = 'Missing client ID. Check URL.';
        //   this.cdr.detectChanges();
        //   return;
      }
      // TODO(cais): Turn into callback.
      // this.state = State.SIGNING_IN;
      gapi.client
          .init({
            // TODO(cais): DO NOT SUBMIT. Remove. Use client secret param instead.
            // apiKey,
            clientId: this.clientId,
            scope: GOOGLE_AUTH_SCOPE,
            discoveryDocs: [DISCOVERY_URL],
          })
          .then(() => {
            console.log(
                '*** gapi client is created. Creating google auth instance.');
            this.googleAuth = gapi.auth2.getAuthInstance();
            console.log('*** Created google auth instance:', this.googleAuth);
            this.googleAuth.isSignedIn.listen(() => {
              console.log('*** google auth is signed in.');
              this.getUserInfo();
            });
            console.log('*** B100');  // DEBUG
            this.getUserInfo();
          })
          .catch((error) => {
            console.log('*** In catch:', error);  // DEBUG
            this.signIn();
          });
      //  TODO(cais): Turn into callback.
      //   this.cdr.detectChanges();
    });
  }

  private getUserInfo(): void {
    if (!this.user) {
      this.user = this.googleAuth!.currentUser.get();
      console.log('Got current user:', this.user);
    }
    if (!this.user) {
      // TODO(cais): Turn into callback.
      //   this._errorMessage = 'Failed to get current user';
      //   this.resetPartnerInfo();
      //   this.state = State.NOT_SIGNED_IN;
      //   this.cdr.detectChanges();
      console.error('Failed to get current user');
      return;
    }
    const isAuthorized = this.user.hasGrantedScopes(GOOGLE_AUTH_SCOPE);
    if (!isAuthorized) {
      // TODO(cais): Turn into callback.
      //   this._errorMessage = 'Not authorized for given scope';
      //   this.resetPartnerInfo();
      //   this.state = State.NOT_SIGNED_IN;
      //   this.cdr.detectChanges();
      console.error('*** User is not authorized for given scope');
      this.signIn();  // TODO(cais): Confirm.
      return;
    }
    this._accessToken = this.user.getAuthResponse().access_token;
    this.onNewAccessToken(this._accessToken);
    console.log('*** Got user access token:', this._accessToken);
    // this.newAccessToken.emit(this._accessToken);
    const userProfile = this.user.getBasicProfile();
    // this._partnerEmail = userProfile.getEmail();
    // this._partnerGivenName = userProfile.getGivenName();
    // this._partnerProfileImageUrl = userProfile.getImageUrl();
    // this.state = State.GETTING_AAC_USER_LIST;
    // console.log('Getting partner users...');
    // this.speakFasterService.getPartnerUsers(this._partnerEmail!)
    //     .subscribe(
    //         (partnerUsersResonse: PartnerUsersResponse) => {
    //           this._userIds.splice(0);
    //           this._userIds.push(...partnerUsersResonse.user_ids);
    //           console.log('Added user IDs:', this._userIds);
    //           this.state = State.READY;
    //           this.cdr.detectChanges();
    //         },
    //         (error) => {
    //           this._errorMessage =
    //               'Failed to get partner users. Using default.';
    //           this._userIds.splice(0);
    //           this._userIds.push(...DEFAULT_USER_IDS);
    //           this.state = State.READY;
    //           this.cdr.detectChanges();
    //           console.warn(
    //               'Retrieving partner user IDs failed, using default user
    //               IDs:', this._userIds);
    //         });
    // this._errorMessage = null;
    // if (this.turnTextInput) {
    //   setTimeout(() => this.turnTextInput.nativeElement.focus());
    // }
    // this.cdr.detectChanges();
  }

  public signIn() {
    console.log('*** Calling signIn():', this.googleAuth);  // DEBUG
    this.googleAuth!.signIn();
  }
}
