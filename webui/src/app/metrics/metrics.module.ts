import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {MetricsComponent} from './metrics.component';

@NgModule({
  declarations: [MetricsComponent],
  imports: [
    BrowserModule,
  ],
  exports: [MetricsComponent],
})
export class MetricsModule {
}
