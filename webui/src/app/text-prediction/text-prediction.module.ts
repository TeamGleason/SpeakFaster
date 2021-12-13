import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {TextPredictionComponent} from './text-prediction.component';

@NgModule({
  declarations: [TextPredictionComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [TextPredictionComponent],
})
export class TextPredictionModule {
}
