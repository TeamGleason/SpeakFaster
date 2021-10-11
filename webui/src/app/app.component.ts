import {Component, Input, OnInit} from '@angular/core';
import {ActivatedRoute} from '@angular/router';

import {SpeakFasterService} from './speakfaster-service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  providers: [SpeakFasterService],
})
export class AppComponent implements OnInit {
  title = 'SpeakFasterApp';

  private endpoint: string = '';
  private accessToken: string = '';

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

  onNewAccessToken(accessToken: string) {
    this.accessToken = accessToken;
    if (this.endpoint) {
      this.speakFasterService.ping(this.endpoint, this.accessToken)
          .subscribe(data => {
            console.log('Ping response:', data);
          });
    }
  }

  hasAccessToken(): boolean {
    return this.accessToken !== '';
  }
}
