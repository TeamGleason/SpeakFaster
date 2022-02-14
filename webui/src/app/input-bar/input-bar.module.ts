import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {InputBarChipModule} from '../input-bar-chip/input-bar-chip.module';
import {SpeakButtonModule} from '../speak-button/speak-button.module';

import {InputBarComponent} from './input-bar.component';

@NgModule({
  declarations: [InputBarComponent],
  imports: [
    BrowserModule,
    InputBarChipModule,
    SpeakButtonModule,
  ],
  exports: [InputBarComponent],
})
export class InputBarModule {
}
