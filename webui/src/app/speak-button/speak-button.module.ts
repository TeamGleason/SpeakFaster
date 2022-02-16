import {NgModule} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {BrowserModule} from '@angular/platform-browser';

import {SpeakButtonComponent} from './speak-button.component';

@NgModule({
  declarations: [SpeakButtonComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
  ],
  exports: [SpeakButtonComponent],
})
export class SpeakButtonModule {
}
