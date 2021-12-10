import {AfterViewInit, Component, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';

import {registerExternalKeypressHook} from '../utils/cefsharp';

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

  private endpoint: string = '';
  private accessToken: string = '';

  textEntryBeginSubject: Subject<TextEntryBeginEvent> =
      new Subject<TextEntryBeginEvent>();
  textEntryEndSubject: Subject<TextEntryEndEvent> = new Subject();

  constructor(
      private route: ActivatedRoute,
      public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['endpoint'] && this.endpoint === '') {
        this.endpoint = params['endpoint'];
        console.log('SpeakFaster endpoint:', this.endpoint);
      }
    });
  }

  ngAfterViewInit() {
    registerExternalKeypressHook(
        this.externalEventsComponent.externalKeypressHook.bind(
            this.externalEventsComponent));
  }

  onNewAccessToken(accessToken: string) {
    this.accessToken = accessToken;
    if (this.endpoint) {
      this.speakFasterService.ping(this.endpoint, this.accessToken)
          .subscribe(data => {
            console.log('Ping response:', data);
          });
    }
  }
}
