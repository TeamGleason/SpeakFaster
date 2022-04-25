import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {TtsVoiceSelectionComponent} from './tts-voice-selection.component';

@NgModule({
  declarations: [TtsVoiceSelectionComponent],
  imports: [
    BrowserModule,
  ],
  exports: [TtsVoiceSelectionComponent],
})
export class TtsVoiceSelectionModule {
}
