import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

import {PhraseModule} from '../phrase/phrase.module';
import {SpellModule} from '../spell/spell.module';

import {AbbreviationComponent} from './abbreviation.component';

@NgModule({
  declarations: [AbbreviationComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
    PhraseModule,
    SpellModule,
  ],
  exports: [AbbreviationComponent],
})
export class AbbreviationModule {
}
