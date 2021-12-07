import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AbbreviationEditingModule} from './abbreviation-editing/abbreviation-editing.module';
import {AbbreviationModule} from './abbreviation/abbreviation.module';
import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ContextModule} from './context/context.module';
import {ExternalEventsModule} from './external/external-events.module';
import {KeyboardModule} from './keyboard/keyboard.module';
import {MetricsModule} from './metrics/metrics.module';
import {TextContinuationModule} from './text-continuation/text-continuation.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    AbbreviationEditingModule,
    AbbreviationModule,
    AppRoutingModule,
    AuthModule,
    BrowserModule,
    ContextModule,
    ExternalEventsModule,
    KeyboardModule,
    MetricsModule,
    TextContinuationModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
