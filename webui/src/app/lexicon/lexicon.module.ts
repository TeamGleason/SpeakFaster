import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {LexiconComponent} from './lexicon.component';

@NgModule({
  declarations: [LexiconComponent],
  imports: [
    BrowserModule,
  ],
  exports: [LexiconComponent],
})
export class LexiconModule {
}
