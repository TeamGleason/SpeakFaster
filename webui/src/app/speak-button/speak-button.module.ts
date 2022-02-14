import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpeakButtonComponent} from './speak-button.component';

@NgModule({
  declarations: [SpeakButtonComponent],
  imports: [
    BrowserModule,
  ],
  exports: [SpeakButtonComponent],
})
export class SpeakButtonModule {
}
