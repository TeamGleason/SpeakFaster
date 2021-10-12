import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AbbreviationComponent} from './abbreviation.component';

@NgModule({
  declarations: [AbbreviationComponent],
  imports: [
    BrowserModule,
  ],
  exports: [AbbreviationComponent],
})
export class AbbreviationModule {
}
