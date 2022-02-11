import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

import {InputBarChipComponent} from './input-bar-chip.component';

@NgModule({
  declarations: [InputBarChipComponent],
  imports: [
    BrowserModule,
    SpellModule,
  ],
  exports: [InputBarChipComponent],
})
export class InputBarChipModule {
}
