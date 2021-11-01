import {Component, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';

import {ConversationTurn} from './context/context';
import {SpeakFasterService} from './speakfaster-service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit {
  title = 'SpeakFasterApp';

  // Set this to `false` to skip using access token (e.g., developing with
  // an automatically authorized browser context.)
  private static readonly USE_ACCESS_TOKEN = false;

  private _endpoint: string = '';
  private _accessToken: string = '';

  speechContent: string|null = null;
  inputAbbreviation: string = 'iwtnsh';

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['endpoint'] && this.endpoint === '') {
        this._endpoint = params['endpoint'];
      }
    });
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
    return !AppComponent.USE_ACCESS_TOKEN || this._accessToken !== '';
  }

  get endpoint() {
    return this._endpoint;
  }

  get accessToken() {
    return this._accessToken;
  }

  onContextTurnSelected(contextTurn: ConversationTurn) {
    this.speechContent = contextTurn.content;
  }

  onAbbreviationInput(event: Event) {
    this.inputAbbreviation = (event.target as HTMLInputElement).value;
  }
}
