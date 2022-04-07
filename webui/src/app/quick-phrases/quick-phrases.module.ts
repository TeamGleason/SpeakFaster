import {NgModule} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {BrowserModule} from '@angular/platform-browser';

import {PhraseEditingModule} from '../phrase-editing/phrase-editing.module';
import {PhraseModule} from '../phrase/phrase.module';
import {ScrollButtonsModule} from '../scroll-buttons/scroll-buttons.modue';

import {QuickPhrasesComponent} from './quick-phrases.component';

@NgModule({
  declarations: [QuickPhrasesComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
    PhraseEditingModule,
    PhraseModule,
    ScrollButtonsModule,
  ],
  exports: [QuickPhrasesComponent],
})
export class QuickPhrasesModule {
}
