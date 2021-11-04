import {Component, HostListener, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {ConversationTurn, SpeakFasterService} from './speakfaster-service';
import {AbbreviationExpansionSelectionEvent, InputAbbreviationChangedEvent} from './types/abbreviations';
import {TextInjection} from './types/text-injection';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit {
  title = 'SpeakFasterApp';

  // Set this to `false` to skip using access token (e.g., developing with
  // an automatically authorized browser context.)
  private useAccessToken = true;

  private _endpoint: string = '';
  private _accessToken: string = '';
  isSpelling = false;

  abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent> =
      new Subject();
  textInjectionSubject: Subject<TextInjection> = new Subject();

  speechContent: string|null = null;

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
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

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.hasAccessToken()) {
      return;
    }
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

  onContextTurnSelected(contextTurn: ConversationTurn) {
    if (contextTurn == null) {
      return;
    }
    this.speechContent = contextTurn.speechContent;
  }

  onAbbreviationInputChanged(abbreviationChangedEvent:
                                 InputAbbreviationChangedEvent) {
    this.abbreviationExpansionTriggers.next(abbreviationChangedEvent);
  }

  onSpellingStateChanged(state: 'START'|'END') {
    this.isSpelling = state === 'START';
  }

  onAbbreviationExpansionSelected(event: AbbreviationExpansionSelectionEvent) {
    this.textInjectionSubject.next({
      text: event.expansionText,
      timestampMillis: Date.now(),
    });
  }
}
