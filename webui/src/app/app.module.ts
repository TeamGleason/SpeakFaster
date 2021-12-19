import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AbbreviationModule} from './abbreviation/abbreviation.module';
import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ContextModule} from './context/context.module';
import {ExternalEventsModule} from './external/external-events.module';
import {MetricsModule} from './metrics/metrics.module';
import {TextPredictionModule} from './text-prediction/text-prediction.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    AbbreviationModule,
    AppRoutingModule,
    AuthModule,
    BrowserModule,
    ContextModule,
    ExternalEventsModule,
    MetricsModule,
    TextPredictionModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
