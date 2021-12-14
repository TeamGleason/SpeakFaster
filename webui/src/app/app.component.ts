import {AfterViewInit, Component, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {bindCefSharpListener, registerExternalKeypressHook} from '../utils/cefsharp';

import {SpeakFasterService} from './speakfaster-service';
import {ExternalEventsComponent} from './external/external-events.component';
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

  textEntryBeginSubject: Subject<TextEntryBeginEvent> =
      new Subject<TextEntryBeginEvent>();
  textEntryEndSubject: Subject<TextEntryEndEvent> = new Subject();

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
    registerExternalKeypressHook(
        this.externalEventsComponent.externalKeypressHook.bind(
            this.externalEventsComponent));
  }

  onNewAccessToken(accessToken: string) {
    this._accessToken = accessToken;
    if (this.endpoint) {
      this.speakFasterService.ping(this._endpoint, this._accessToken)
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
}
