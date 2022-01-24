import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellComponent} from './spell.component';

@NgModule({
  declarations: [SpellComponent],
  imports: [
    BrowserModule,
  ],
  exports: [SpellComponent],
})
export class SpellModule {
}
