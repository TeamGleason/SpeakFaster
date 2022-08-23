import {} from 'gapi.auth2';

const GOOGLE_AUTH_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const DISCOVERY_URL =
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

export class OAuth2Helper {
  private googleAuth?: gapi.auth2.GoogleAuth;
  private user?: gapi.auth2.GoogleUser;
  private _accessToken: string|null = null;

  constructor(private readonly clientId: string, private callbacks: {
    onSuccess: (token: string, user: gapi.auth2.GoogleUser) => void,
    onInvalidClientId: (clientId: string) => void,
    onInvalidUserInfo: () => void,
    onUserNotAuthorized: () => void,
    onNoGapiError: () => void,
    onMiscError: (error: Error) => void,
  }) {}

  public init() {
    if ((window as any).gapi) {
      gapi.load('client:auth2', () => {
        if (!this.clientId) {
          this.callbacks.onInvalidClientId(this.clientId);
        }
        gapi.client
            .init({
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
              this.getUserInfo();
            })
            .catch((error) => {
              this.callbacks.onMiscError(error);
              this.signIn();
            });
      });
    } else {
      console.error('gapi is not defined. cannot perform authentication.');
      this.callbacks.onNoGapiError();
    }
  }

  private getUserInfo(): void {
    if (!this.user) {
      this.user = this.googleAuth!.currentUser.get();
      console.log('Got current user:', this.user);
    }
    if (!this.user) {
      console.error('Failed to get current user');
      this.callbacks.onInvalidUserInfo();
      return;
    }
    const isAuthorized = this.user.hasGrantedScopes(GOOGLE_AUTH_SCOPE);
    if (!isAuthorized) {
      this.callbacks.onUserNotAuthorized();
      console.error('*** User is not authorized for given scope');
      this.signIn();
      return;
    }
    this._accessToken = this.user.getAuthResponse().access_token;
    this.callbacks.onSuccess(this._accessToken, this.user);
    console.log('*** Got user access token:', this._accessToken);
  }

  public signIn() {
    this.googleAuth!.signIn();
  }

  public signOut() {
    this.googleAuth!.signOut();
  }
}
