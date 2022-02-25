import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {bindCefSharpListener, registerExternalKeypressHook, resizeWindow, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../utils/cefsharp';
import {createUuid} from '../utils/uuid';

import {registerAppState} from './app-state-registry';
import {HttpEventLogger} from './event-logger/event-logger-impl';
import {ExternalEventsComponent} from './external/external-events.component';
import {configureService, SpeakFasterService} from './speakfaster-service';
import {InputAbbreviationChangedEvent} from './types/abbreviation';
import {AppState} from './types/app-state';
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
  appState: AppState = AppState.ABBREVIATION_EXPANSION;
  private previousNonMinimizedAppState: AppState = this.appState;

  private _isPartner = false;
  private _showMetrics = false;
  // Set this to `false` to skip using access token (e.g., developing with
  // an automatically authorized browser context.)
  private useAccessToken = true;

  // TODO(cais): Control with URL parameter.
  private _userId: string = 'testuser';
  private _endpoint: string = '';
  private _accessToken: string = '';

  abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent> =
      new Subject();
  textEntryBeginSubject: Subject<TextEntryBeginEvent> =
      new Subject<TextEntryBeginEvent>();
  textEntryEndSubject: Subject<TextEntryEndEvent> = new Subject();
  readonly contextStrings: string[] = [];

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService,
      public eventLogger: HttpEventLogger) {
    this.eventLogger.setUserId(this._userId);
    console.log('Event logger session ID:', this.eventLogger.sessionId);
}

  ngOnInit() {
    registerAppState(this.appState);
    bindCefSharpListener();
    this.route.queryParams.subscribe(params => {
      if (params['partner']) {
        const partnerFlag = params['partner'].toLocaleLowerCase();
        this._isPartner = partnerFlag === 'true' || partnerFlag === '1' ||
            partnerFlag === 't';
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
        })
      }
    });
    this.textEntryEndSubject.subscribe(textEntryEndEvent => {
      if (textEntryEndEvent.text.length > 0) {
        // TODO(#59): Support multiple contexts, with timing information.
        this.contextStrings.splice(0);
        this.contextStrings.push(textEntryEndEvent.text);
      }
    });
  }

  private stringValueMeansTrue(str: string): boolean {
    str = str.trim().toLocaleLowerCase();
    return str === 'true' || str === '1' || str === 't';
  }

  ngAfterViewInit() {
    registerExternalKeypressHook(
        this.externalEventsComponent.externalKeypressHook.bind(
            this.externalEventsComponent));
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
    this.eventLogger.logSessionStart();
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
    this.eventLogger.logSessionEnd();
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }

  onAppStateDeminimized() {
    if (this.appState !== AppState.MINIBAR) {
      return;
    }
    this.changeAppState(this.previousNonMinimizedAppState);
  }

  private changeAppState(newState: AppState) {
    if (this.appState === newState) {
      return;
    }
    this.eventLogger.logAppStageChange(this.appState, newState);
    this.appState = newState;
    if (this.appState !== AppState.MINIBAR) {
      this.previousNonMinimizedAppState = this.appState;
    }
  }

  getUserRole(): UserRole {
    return this._isPartner ? UserRole.PARTNER : UserRole.AAC_USER;
  }

  get showMetrics(): boolean {
    return this._showMetrics;
  }

  onNewAccessToken(accessToken: string) {
    this._accessToken = accessToken;
    configureService({
      endpoint: this._endpoint,
      accessToken,
    });
  }

  hasAccessToken(): boolean {
    return !this.useAccessToken || this._accessToken !== '';
  }

  get endpoint() {
    return this._endpoint;
  }

  get accessToken() {
    return this._accessToken;
  }

  onMinimizeButtonClicked(event: Event) {
    this.changeAppState(AppState.MINIBAR);
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
      case 'QUICK_PHRASES_CARE':
        this.changeAppState(AppState.QUICK_PHRASES_CARE);
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

  isQuickPhrasesAppState() {
    return this.appState === AppState.QUICK_PHRASES_FAVORITE ||
        this.appState === AppState.QUICK_PHRASES_PARTNERS ||
        this.appState === AppState.QUICK_PHRASES_CARE;
  }

  get nonMinimizedStatesAppStates(): AppState[] {
    return [
      AppState.QUICK_PHRASES_FAVORITE, AppState.QUICK_PHRASES_PARTNERS,
      AppState.QUICK_PHRASES_CARE, AppState.ABBREVIATION_EXPANSION
    ];
  }

  getNonMinimizedStateImgSrc(appState: AppState, isActive: boolean): string {
    const activeStateString = isActive ? 'active' : 'inactive';
    switch (appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return `/assets/images/quick-phrases-favorite-${activeStateString}.png`;
      case AppState.QUICK_PHRASES_PARTNERS:
        return `/assets/images/quick-phrases-partners-${activeStateString}.png`;
      case AppState.QUICK_PHRASES_CARE:
        return `/assets/images/quick-phrases-care-${activeStateString}.png`;
      case AppState.ABBREVIATION_EXPANSION:
        return `/assets/images/abbreviation-expansion-${activeStateString}.png`;
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  }

  getSettingsStateImgSrc(isActive: boolean): string {
    const activeStateString = isActive ? 'active' : 'inactive';
    return `/assets/images/menu-${activeStateString}.png`;
  }

  getQuickPhrasesAllowedTags(): string[] {
    switch (this.appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return ['favorite'];
      case AppState.QUICK_PHRASES_PARTNERS:
        return ['partner'];
      case AppState.QUICK_PHRASES_CARE:
        return ['care'];
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  };

  getQuickPhrasesColor(): string {
    switch (this.appState) {
      case AppState.QUICK_PHRASES_FAVORITE:
        return '#473261';
      case AppState.QUICK_PHRASES_PARTNERS:
        return '#3F0909';
      case AppState.QUICK_PHRASES_CARE:
        return '#093F3A';
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  }
}
