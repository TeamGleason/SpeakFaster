import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {TextContinuationComponent} from './text-continuation.component';

@NgModule({
  declarations: [TextContinuationComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [TextContinuationComponent],
})
export class TextContinuationModule {
}
