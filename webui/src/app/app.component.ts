import {AfterViewInit, Component, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {bindCefSharpListener, registerExternalKeypressCallback} from '../utils/cefsharp';

import {ExternalEventsComponent} from './external/external-events.component';
import {SpeakFasterService} from './speakfaster-service';
import {AbbreviationExpansionSelectionEvent, InputAbbreviationChangedEvent} from './types/abbreviations';
import {TextEntryBeginEvent, TextEntryEndEvent} from './types/text-entry';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit, AfterViewInit {
  title = 'SpeakFasterApp';

  @ViewChild('externalEvents')
  externalEventsComponent!: ExternalEventsComponent;

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
  contextStrings: string[] = [];

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
      }
    });
  }

  ngAfterViewInit() {
    registerExternalKeypressCallback(
        this.externalEventsComponent.externalKeypressHook.bind(
            this.externalEventsComponent));
  }

  onNewAccessToken(accessToken: string) {
    this._accessToken = accessToken;
    if (this.endpoint) {
      this.speakFasterService.ping(this.endpoint, this._accessToken)
          .subscribe(data => {
            console.log('Ping response:', data);
          });
    }
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

  onContextStringsSelected(contextStrings: string[]) {
    this.contextStrings = contextStrings;
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

  onAbbreviationExpansionSelected(event: AbbreviationExpansionSelectionEvent) {
    this.textEntryEndSubject.next({
      text: event.expansionText,
      timestampMillis: Date.now(),
      isFinal: true,
    });
  }
}
