import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {PhraseModule} from '../phrase/phrase.module';
import {QuickPhrasesComponent} from './quick-phrases.component';

@NgModule({
  declarations: [QuickPhrasesComponent],
  imports: [
    BrowserModule,
    PhraseModule,
  ],
  exports: [QuickPhrasesComponent],
})
export class QuickPhrasesModule {
}