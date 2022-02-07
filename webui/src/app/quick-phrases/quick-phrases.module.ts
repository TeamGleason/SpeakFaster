import {NgModule} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {BrowserModule} from '@angular/platform-browser';

import {PhraseModule} from '../phrase/phrase.module';

import {QuickPhrasesComponent} from './quick-phrases.component';

@NgModule({
  declarations: [QuickPhrasesComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
    PhraseModule,
  ],
  exports: [QuickPhrasesComponent],
})
export class QuickPhrasesModule {
}
