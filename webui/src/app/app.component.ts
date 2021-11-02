import {Component, HostListener, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {isTextContentKey} from 'src/utils/keyboard-utils';

import {ConversationTurn, SpeakFasterService} from './speakfaster-service';

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

  speechContent: string|null = null;
  inputAbbreviation: string = '';

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
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'x') {
      // Ctrl X clears the input box.
      this.inputAbbreviation = '';
      event.preventDefault();
      event.stopPropagation();
    } else if (
        event.altKey || event.metaKey || event.shiftKey || event.ctrlKey) {
      return;
    } else if (event.key === 'Backspace') {
      if (this.inputAbbreviation.length > 0) {
        this.inputAbbreviation = this.inputAbbreviation.substring(
            0, this.inputAbbreviation.length - 1);
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (isTextContentKey(event)) {
      this.inputAbbreviation += event.key;
      event.preventDefault();
      event.stopPropagation();
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

  onAbbreviationInput(event: Event) {
    this.inputAbbreviation = (event.target as HTMLInputElement).value;
  }
}
