import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ExternalEventsModule} from './external/external-events.module';
import {MetricsModule} from './metrics/metrics.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    AppRoutingModule,
    AuthModule,
    BrowserModule,
    ExternalEventsModule,
    MetricsModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
