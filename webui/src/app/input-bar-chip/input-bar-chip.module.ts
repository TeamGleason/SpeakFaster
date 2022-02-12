import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {InputBarChipComponent} from './input-bar-chip.component';

@NgModule({
  declarations: [InputBarChipComponent],
  imports: [
    BrowserModule,
  ],
  exports: [InputBarChipComponent],
})
export class InputBarChipModule {
}
