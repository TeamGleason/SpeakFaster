import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {AbbreviationComponent} from './abbreviation.component';

@NgModule({
  declarations: [AbbreviationComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [AbbreviationComponent],
})
export class AbbreviationModule {
}
