import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {TextPredictionComponent} from './text-prediction.component';

@NgModule({
  declarations: [TextPredictionComponent],
  imports: [
    BrowserModule,
  ],
  exports: [TextPredictionComponent],
})
export class TextPredictionModule {
}
