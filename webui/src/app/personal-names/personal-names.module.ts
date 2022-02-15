import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {PersonalNamesComponent} from './personal-names.component';

@NgModule({
  declarations: [PersonalNamesComponent],
  imports: [
    BrowserModule,
  ],
  exports: [PersonalNamesComponent],
})
export class PersonalNamesModule {
}
