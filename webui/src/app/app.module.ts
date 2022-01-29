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
import {MiniBarModule} from './mini-bar/mini-bar.module';
import {PartnerModule} from './partner/partner.module';
import {QuickPhrasesModule} from './quick-phrases/quick-phrases.module';
import {TextPredictionModule} from './text-prediction/text-prediction.module';
import {TextToSpeechModule} from './text-to-speech/text-to-speech.module';

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
    MiniBarModule,
    PartnerModule,
    QuickPhrasesModule,
    TextPredictionModule,
    TextToSpeechModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
