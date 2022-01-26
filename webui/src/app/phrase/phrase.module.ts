import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {PhraseComponent} from './phrase.component';

@NgModule({
  declarations: [PhraseComponent],
  imports: [
    BrowserModule,
  ],
  exports: [PhraseComponent],
})
export class PhraseModule {
}
