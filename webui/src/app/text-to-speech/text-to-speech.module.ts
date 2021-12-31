import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {TextToSpeechComponent} from './text-to-speech.component';

@NgModule({
  declarations: [TextToSpeechComponent],
  imports: [
    BrowserModule,
  ],
  exports: [TextToSpeechComponent],
})
export class TextToSpeechModule {
}
