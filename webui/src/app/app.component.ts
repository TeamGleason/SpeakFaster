import {AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {bindCefSharpListener, registerExternalKeypressHook, resizeWindow, updateButtonBoxesForElements} from '../utils/cefsharp';
import {createUuid} from '../utils/uuid';

import {ExternalEventsComponent} from './external/external-events.component';
import {configureService, SpeakFasterService} from './speakfaster-service';
import {InputAbbreviationChangedEvent} from './types/abbreviation';
import {AppState} from './types/app-state';
import {TextEntryBeginEvent, TextEntryEndEvent} from './types/text-entry';


// Type signature of callback functions that listen to resizing of an element.
export type AppResizeCallback = (height: number, width: number) => void;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit, AfterViewInit {
  title = 'SpeakFasterApp';
  private static readonly _NAME = 'AppComponent';
  private readonly instanceId = AppComponent._NAME + '_' + createUuid();

  private static readonly appResizeCallbacks: AppResizeCallback[] = [];

  @ViewChild('externalEvents')
  externalEventsComponent!: ExternalEventsComponent;

  @ViewChild('contentWrapper') contentWrapper!: ElementRef<HTMLDivElement>;

  appState: AppState = AppState.ABBREVIATION_EXPANSION;
  private previousNonMinimizedAppState: AppState = this.appState;
  // TODO(cais): Remember previous non-minibar state and restore it.

  // Set this to `false` to skip using access token (e.g., developing with
  // an automatically authorized browser context.)
  private useAccessToken = true;

  private _endpoint: string = '';
  private _accessToken: string = '';
  isSpelling = false;

  abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent> =
      new Subject();
  textEntryBeginSubject: Subject<TextEntryBeginEvent> =
      new Subject<TextEntryBeginEvent>();
  textEntryEndSubject: Subject<TextEntryEndEvent> = new Subject();
  // Context speech content used for AE and other text predictions.
  inputAbbreviation: string = '';
  readonly contextStrings: string[] = [];

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    bindCefSharpListener();
    this.route.queryParams.subscribe(params => {
      if (params['endpoint'] && this.endpoint === '') {
        this._endpoint = params['endpoint'];
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
    this.appState = newState;
    if (this.appState !== AppState.MINIBAR) {
      this.previousNonMinimizedAppState = this.appState;
    }
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

  onQuickPhrasesCareButtonClicked(event: Event, appState: string) {
    switch (appState) {
      case 'QUICK_PHRASES_PARTNERS':
        this.changeAppState(AppState.QUICK_PHRASES_PARTNERS);
        break;
      case 'QUICK_PHRASES_CARE':
        this.changeAppState(AppState.QUICK_PHRASES_CARE);
        break;
      default:
        break;
    }
  }

  onContextStringsSelected(contextStrings: string[]) {
    this.contextStrings.splice(0);
    this.contextStrings.push(...contextStrings);
  }

  onAbbreviationInputChanged(abbreviationChangedEvent:
                                 InputAbbreviationChangedEvent) {
    this.inputAbbreviation =
        abbreviationChangedEvent.abbreviationSpec.readableString;
    this.abbreviationExpansionTriggers.next(abbreviationChangedEvent);
  }

  onSpellingStateChanged(state: 'START'|'END') {
    this.isSpelling = state === 'START';
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

  isQuickPhrasesAppState() {
    return this.appState == AppState.QUICK_PHRASES_PARTNERS ||
        this.appState == AppState.QUICK_PHRASES_CARE;
  }

  get quickPhrasesStatesAppStates(): AppState[] {
    return [AppState.QUICK_PHRASES_PARTNERS, AppState.QUICK_PHRASES_CARE];
  }

  getQuickPhrasesImgSrc(appState: AppState, isActive: boolean): string {
    const activeStateString = isActive ? 'active' : 'inactive';
    switch (appState) {
      case AppState.QUICK_PHRASES_PARTNERS:
        return `/assets/images/quick-phrases-partners-${activeStateString}.png`;
      case AppState.QUICK_PHRASES_CARE:
        return `/assets/images/quick-phrases-care-${activeStateString}.png`;
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  }

  // TODO(cais): Do not hardcode.
  getQuickPhrases(): string[] {
    switch (this.appState) {
      case AppState.QUICK_PHRASES_PARTNERS:
        return [
          'Alice', 'Bob', 'Charlie', 'Danielle', 'Elly', 'Frank', 'George',
          'Heather'
        ];
      case AppState.QUICK_PHRASES_CARE:
        return [
          'Good morning',
          'Thank you very much',
          'Hi there brother',
          'You make me smile easy',
          'I need to think about that',
          'Have a wonderfully wonderful Tuesday',
          'Let\'s go for a walk',
        ];
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  }

  // TODO(cais): Do not hardcode.
  getQuickPhrasesColor(): string {
    switch (this.appState) {
      case AppState.QUICK_PHRASES_PARTNERS:
        return '#3F0909';
      case AppState.QUICK_PHRASES_CARE:
        return '#093F3A';
      default:
        throw new Error(`Invalid app state: ${this.appState}`);
    }
  }
}
