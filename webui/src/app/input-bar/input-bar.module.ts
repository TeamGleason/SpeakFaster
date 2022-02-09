import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {InputBarComponent} from './input-bar.component';

@NgModule({
  declarations: [InputBarComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [InputBarComponent],
})
export class InputBarModule {
}
