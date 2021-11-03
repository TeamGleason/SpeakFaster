import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AbbreviationEditingComponent} from './abbreviation-editing.component';

@NgModule({
  declarations: [AbbreviationEditingComponent],
  imports: [
    BrowserModule,
  ],
  exports: [AbbreviationEditingComponent],
})
export class AbbreviationEditingModule {
}
