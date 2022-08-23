import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {bindCefSharpListener, bringFocusAppToForeground, bringWindowToForeground, EYE_TRACKER_STATUS, registerExternalAccessTokenHook, registerExternalKeypressHook, registerEyeTrackerStatusHook, registerHostWindowFocusHook, resizeWindow, setHostEyeGazeOptions, toggleGazeButtonsState, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../utils/cefsharp';
import {createUuid} from '../utils/uuid';

import {OAuth2Helper} from './auth/oauth2-helper';
import {HttpEventLogger} from './event-logger/event-logger-impl';
import {ExternalEventsComponent} from './external/external-events.component';
import {InputBarControlEvent} from './input-bar/input-bar.component';
import {LoadLexiconRequest} from './lexicon/lexicon.component';
import {configureService, FillMaskRequest, GetUserIdResponse, SpeakFasterService} from './speakfaster-service';
import {StudyManager} from './study/study-manager';
import {InputAbbreviationChangedEvent} from './types/abbreviation';
import {AppState, getAppState, getPreviousNonMinimizedAppState, setAppState} from './types/app-state';
import {AddContextualPhraseRequest} from './types/contextual_phrase';
import {ConversationTurn} from './types/conversation';
import {TextEntryBeginEvent, TextEntryEndEvent} from './types/text-entry';

// Type signature of callback functions that listen to resizing of an element.
export type AppResizeCallback = (height: number, width: number) => void;

export enum UserRole {
  AAC_USER = 'AAC_USER',
  PARTNER = 'PARTNER',
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  title = 'SpeakFasterApp';
  private static readonly _NAME = 'AppComponent';
  private readonly instanceId = AppComponent._NAME + '_' + createUuid();

  private static readonly appResizeCallbacks: AppResizeCallback[] = [];

  @ViewChild('externalEvents')
  externalEventsComponent!: ExternalEventsComponent;

  @ViewChild('contentWrapper') contentWrapper!: ElementRef<HTMLDivElement>;

  readonly languageCode = 'en-us';

  private _isDev = false;
  private _isPartner = false;
  private _showMetrics = false;
  // Set this to `false` to skip using access token (e.g., developing with
  // an automatically authorized browser context.)
  private useAccessToken = true;

  private _userId: string =
      'testuser';  // Can be overridden by URL params later.
  private _userGivenName: string|null = null;
  private _userEmail: string|null = null;
  private _endpoint: string = '';
  private _accessToken: string = '';
  private _isFocused: boolean = true;
  isSpelling = false;

  abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent> =
      new Subject();
  fillMaskTriggers: Subject<FillMaskRequest> = new Subject();
  textEntryBeginSubject: Subject<TextEntryBeginEvent> =
      new Subject<TextEntryBeginEvent>();
  textEntryEndSubject: Subject<TextEntryEndEvent> = new Subject();
  addContextualPhraseSubject: Subject<AddContextualPhraseRequest> =
      new Subject();
  inputBarControlSubject: Subject<InputBarControlEvent> = new Subject();
  loadPrefixedLexiconRequestSubject: Subject<LoadLexiconRequest> =
      new Subject();

  // Context speech content used for AE and other text predictions.
  readonly conversationTurnsAvailable: ConversationTurn[] = [];
  readonly conversationTurnsSelected: ConversationTurn[] = [];
  inputString: string = '';

  private _inputBarNotification?: string;
  private _errorMessage?: string = undefined;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService,
      public studyManager: StudyManager, public eventLogger: HttpEventLogger) {
    this.eventLogger.setUserId(this._userId);
    console.log('Event logger session ID:', this.eventLogger.sessionId);
  }

  ngOnInit() {
    // Disable accidental activation of the context menu.
    document.addEventListener('contextmenu', event => event.preventDefault());
    bindCefSharpListener().then(() => {
      setHostEyeGazeOptions();
    });
    this.route.queryParams.subscribe(params => {
      if (params['dev']) {
        this._isDev = this.stringValueMeansTrue(params['dev']);
      }
      if (params['partner']) {
        this._isPartner = this.stringValueMeansTrue(params['partner']);
      }
      if (params['endpoint'] && this.endpoint === '') {
        this._endpoint = params['endpoint'];
      }
      if (params['show_metrics']) {
        this._showMetrics = this.stringValueMeansTrue(params['show_metrics']);
      }
      const useOauth = params['use_oauth'];
      if (typeof useOauth === 'string' &&
          (useOauth.toLocaleLowerCase() === 'false' || useOauth === '0')) {
        this.useAccessToken = false;
        configureService({
          endpoint: this._endpoint,
          accessToken: '',
        });
      }
      if (params['client_id'] && this.useAccessToken) {
        const oauth2Helper = new OAuth2Helper(params['client_id'], {
          onSuccess: (accessToken: string, user: gapi.auth2.GoogleUser) => {
            this.onNewAccessToken(accessToken);
            this._userEmail = user.getBasicProfile().getEmail();
            this._userGivenName = user.getBasicProfile().getGivenName();
            this.getUserId();
          },
          onInvalidClientId: (invalidClientId) => {
            this._errorMessage = 'Error: invalid OAuth2 client ID';
          },
          onInvalidUserInfo: () => {
            this._errorMessage = 'Error: OAuth2 failed to get user info';
          },
          onUserNotAuthorized: () => {},
          onNoGapiError: () => {
            this._errorMessage = 'Error: No gapi available.';
          },
          onMiscError: (error: Error) => {
            this._errorMessage = `Error: ${error.message}`;
          },
        });
        oauth2Helper.init();
      }

      // TODO(cais): Add unit tests.
      const userEmail = params['user_email'];
      console.log(`Got user email from URL parameters: ${userEmail}`);
      if (userEmail && userEmail !== this._userEmail) {
        this._userEmail = userEmail;
        this.getUserId();
      }
      const userGivenName = params['user_given_name'];
      if (userGivenName && userGivenName !== this._userGivenName) {
        this._userGivenName = userGivenName;
      }
    });
  }

  private getUserId() {
    if (!this._userEmail) {
      return;
    }
    this.speakFasterService.getUserId(this._userEmail)
        .subscribe(
            (response: GetUserIdResponse) => {
              if (response.error) {
                console.error(
                    `Failed to convert user email to user ID: response error: ${
                        response.error}`);
              }
              if (response.user_id) {
                this._userId = response.user_id;
                console.log('Got user ID from email address:', this.userId);
                this.eventLogger.setUserId(this.userId);
                this.eventLogger.logSessionStart();
              }
            },
            error => {
              console.error(
                  'Failed to convert user email to user ID:', this.userEmail);
            });
  }

  private stringValueMeansTrue(str: string): boolean {
    str = str.trim().toLocaleLowerCase();
    return str === 'true' || str === '1' || str === 't';
  }

  ngAfterViewInit() {
    registerExternalAccessTokenHook((externalAccessToken: string) => {
      console.log(`Received new external access token: ${externalAccessToken}`);
      this.onNewAccessToken(externalAccessToken);
    });
    registerHostWindowFocusHook((isFocused: boolean) => {
      this._isFocused = isFocused;
    });
    registerExternalKeypressHook((vkCode: number, isExternal: boolean) => {
      ExternalEventsComponent.externalKeypressHook(vkCode, isExternal);
    });
    registerEyeTrackerStatusHook(this.eyeTrackerStatusCallback.bind(this));
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length > 1) {
        throw new Error(
            `Expected ResizeObserver to observe at most 1 entry, ` +
            `but instead got ${entries.length} entries`);
      }
      const entry = entries[0];
      const contentRect = entry.contentRect;
      const {height, width} = contentRect;
      resizeWindow(height, width);
      for (const callback of AppComponent.appResizeCallbacks) {
        callback(height, width);
      }
    });
    resizeObserver.observe(this.contentWrapper.nativeElement);
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
    AppComponent.registerAppResizeCallback(this.appResizeCallback.bind(this));
    ExternalEventsComponent.registerToggleForegroundCallback(
        (toForeground: boolean) => {
          if (toForeground) {  // Bring app to foreground.
            this.changeAppState(AppState.ABBREVIATION_EXPANSION);
            setTimeout(() => {
              bringWindowToForeground();
              // TODO(cais): Add unit test.
              this.inputBarControlSubject.next({refocus: true});
            }, 100);
          } else {  // Bring the focus app to foreground (if it is running).
            this.changeAppState(AppState.MINIBAR);
            setTimeout(() => {
              bringFocusAppToForeground();
            }, 100);
          }
        });
    ExternalEventsComponent.registerToggleEyeTrackingCallback(async () => {
      const enabled = await toggleGazeButtonsState();
      this._inputBarNotification = enabled ?
          undefined :
          ExternalEventsComponent.getEyeTrackingPausedMessage();
    });
    this.eventLogger.logSessionStart();
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
    this.eventLogger.logSessionEnd();
  }

  private eyeTrackerStatusCallback(status: EYE_TRACKER_STATUS): void {
    if (status === 'disconnected') {
      this._inputBarNotification =
          '∅ Eye tracker is disconnected. Trying to reconnect...';
    } else {
      this._inputBarNotification = undefined;
    }
    this.inputBarControlSubject.next({
      refocus: true,
    });
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }

  onAppStateDeminimized() {
    if (getAppState() !== AppState.MINIBAR) {
      return;
    }
    this.changeAppState(getPreviousNonMinimizedAppState());
  }

  private changeAppState(newState: AppState) {
    const prevAppState = getAppState();
    if (prevAppState === newState) {
      return;
    }
    this.eventLogger.logAppStageChange(prevAppState, newState);
    // TODO(cais): Debug the case of finishing an AE in InputBarComponent then
    // switching to a QuickPhraseComponent to do filtering.
    if (newState !== AppState.MINIBAR && prevAppState !== AppState.MINIBAR &&
        newState !== AppState.ABBREVIATION_EXPANSION) {
      // When minimizing to or restoring from the mini-bar, we don't reset the
      // text in the input bar.
      this.inputBarControlSubject.next({
        clearAll: true,
      });
    }
    setAppState(newState);
    this.inputBarControlSubject.next({refocus: true});
  }

  getUserRole(): UserRole {
    return this._isPartner ? UserRole.PARTNER : UserRole.AAC_USER;
  }

  get isDev(): boolean {
    return this._isDev;
  }

  get userId(): string {
    return this._userId;
  }

  get userEmail(): string|null {
    return this._userEmail;
  }

  get userGivenName(): string|null {
    return this._userGivenName;
  }

  get showMetrics(): boolean {
    return this._showMetrics;
  }

  get isFocused(): boolean {
    return this._isFocused;
  }

  onNewAccessToken(accessToken: string) {
    this._accessToken = accessToken;
    configureService({
      endpoint: this.endpoint,
      accessToken,
    });
  }

  get errorMessage(): string|undefined {
    return this._errorMessage;
  }

  get hasAccessToken(): boolean {
    return !this.useAccessToken || this._accessToken !== '';
  }

  get endpoint() {
    return this._endpoint;
  }

  get accessToken() {
    return this._accessToken;
  }

  get isMinimizedOrNonMinimizedAbbreviationExpansionState() {
    const appState = getAppState();
    return appState === AppState.ABBREVIATION_EXPANSION ||
        appState === AppState.MINIBAR;
  }

  get inputBarNotification(): string|undefined {
    return this._inputBarNotification;
  }

  onInputStringChanged(str: string) {
    this.inputString = str;
  }

  onMinimizeButtonClicked(event: Event) {
    this.changeAppState(AppState.MINIBAR);
    setTimeout(() => {
      bringFocusAppToForeground();
    }, 100);
  }

  onContextStringsUpdated(conversationTurns: ConversationTurn[]) {
    // TODO(cais): Add unit tests.
    this.conversationTurnsAvailable.splice(0);
    this.conversationTurnsAvailable.push(...conversationTurns);
  }

  onContextStringsSelected(conversationTurns: ConversationTurn[]) {
    // TODO(cais): Add unit tests.
    this.conversationTurnsSelected.splice(0);
    this.conversationTurnsSelected.push(...conversationTurns);
    this.inputBarControlSubject.next({refocus: true})
  }

  onAbbreviationInputChanged(abbreviationChangedEvent:
                                 InputAbbreviationChangedEvent) {
    this.abbreviationExpansionTriggers.next(abbreviationChangedEvent);
  }

  /**
   * Register callback for app resizeing.
   * This registered callbacks are invoked when the container for the entire
   * app resizes (e.g., due to changes in its content). Other components can
   * use this callback mechanism to get notified when the app container's size
   * changes. Repeated registering of the same callback function is no-op.
   */
  public static registerAppResizeCallback(callback: AppResizeCallback) {
    // TODO(cais): Add unit test.
    if (AppComponent.appResizeCallbacks.indexOf(callback) === -1) {
      AppComponent.appResizeCallbacks.push(callback);
    }
  }

  /** Clear all reigstered app-resize callbacks. */
  public static clearAppResizeCallback() {
    AppComponent.appResizeCallbacks.splice(0);
  }

  onQuickPhrasesCareButtonClicked(event: Event, appState: string) {
    switch (appState) {
      case 'QUICK_PHRASES_FAVORITE':
        this.changeAppState(AppState.QUICK_PHRASES_FAVORITE);
        break;
      case 'QUICK_PHRASES_PARTNERS':
        this.changeAppState(AppState.QUICK_PHRASES_PARTNERS);
        break;
      case 'ABBREVIATION_EXPANSION':
        this.changeAppState(AppState.ABBREVIATION_EXPANSION);
        break;
      default:
        break;
    }
  }

  onSettingsButtonClicked(event: Event) {
    this.changeAppState(AppState.SETTINGS);
  }

  onTtsVoiceSelectionButtonClicked(event: Event) {
    this.changeAppState(AppState.TTS_VOICE_SELECTION);
  }

  onHelpButtonClicked(event: Event) {
    this.changeAppState(AppState.HELP);
  }

  onEyeGazeSettingsButtonClicked(event: Event) {
    this.changeAppState(AppState.EYE_GAZE_SETTINGS);
  }

  onAiSettingsButtonClicked(event: Event) {
    // TODO(cais): Add unit test.
    this.changeAppState(AppState.AI_SETTINGS);
  }

  isQuickPhrasesAppState() {
    const appState = getAppState();
    return appState === AppState.QUICK_PHRASES_FAVORITE ||
        appState === AppState.QUICK_PHRASES_PARTNERS;
  }

  get anyContextStringsAvailable(): boolean {
    return this.conversationTurnsAvailable.length > 0;
  }

  get contextStringsSelected(): string[] {
    return this.conversationTurnsSelected.map(turn => turn.speechContent);
  }

  get inputStringIsCompatibleWithAbbreviationExpansion(): boolean {
    return this.inputString.trim().length > 0;
  }

  get appState(): AppState {
    return getAppState();
  }

  get nonMinimizedStatesAppStates(): AppState[] {
    if (this.studyManager.isStudyOn) {
      return [AppState.ABBREVIATION_EXPANSION];
    } else {
      return [
        AppState.QUICK_PHRASES_PARTNERS,
        AppState.QUICK_PHRASES_FAVORITE,
        AppState.ABBREVIATION_EXPANSION,
      ];
    }
  }

  get isStudyOn(): boolean {
    return this.studyManager.isStudyOn;
  }

  get supportsAbbrevationExpansion(): boolean {
    if (this.studyManager.isStudyOn && !this.studyManager.isAbbreviationMode) {
      return false;
    }
    return this.appState === AppState.ABBREVIATION_EXPANSION;
  }

  getNonMinimizedStateImgSrc(appState: AppState, isActive: boolean): string {
    const activeStateString = isActive ? 'active' : 'inactive';
    switch (appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return `/assets/images/quick-phrases-favorite-${activeStateString}.png`;
      case AppState.QUICK_PHRASES_PARTNERS:
        return `/assets/images/quick-phrases-partners-${activeStateString}.png`;
      case AppState.ABBREVIATION_EXPANSION:
        return `/assets/images/abbreviation-expansion-${activeStateString}.png`;
      default:
        throw new Error(`Invalid app state: ${appState}`);
    }
  }

  getSettingsStateImgSrc(isActive: boolean): string {
    const activeStateString = isActive ? 'active' : 'inactive';
    return `/assets/images/menu-${activeStateString}.png`;
  }

  getQuickPhrasesAllowedTag(): string {
    const appState = getAppState();
    switch (appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return 'favorite';
      case AppState.QUICK_PHRASES_PARTNERS:
        return 'partner-name';
      default:
        throw new Error(`Invalid app state: ${appState}`);
    }
  }

  getQuickPhrasesShowDeleteButtons(): boolean {
    const appState = getAppState();
    switch (appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
      case AppState.QUICK_PHRASES_PARTNERS:
        return true;
      default:
        throw new Error(`Invalid app state: ${appState}`);
    }
  }

  getQuickPhrasesShowExpandButtons(): boolean {
    const appState = getAppState();
    switch (appState) {
      case AppState.QUICK_PHRASES_PARTNERS:
        return true;
      case AppState.QUICK_PHRASES_FAVORITE:
        return false;
      default:
        throw new Error(`Invalid app state: ${appState}`);
    }
  }

  getQuickPhrasesColor(): string {
    const appState = getAppState();
    switch (appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return '#473261';
      case AppState.QUICK_PHRASES_PARTNERS:
        return '#3F0909';
      default:
        throw new Error(`Invalid app state: ${appState}`);
    }
  }
}
