import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {AbbreviationEditingComponent} from './abbreviation-editing.component';

@NgModule({
  declarations: [AbbreviationEditingComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [AbbreviationEditingComponent],
})
export class AbbreviationEditingModule {
}
